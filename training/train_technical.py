"""
Fine-tune DistilBERT on labeled finance answers (topic-prefixed text, 4-class expertise level).
"""
from __future__ import annotations

import json
import argparse
from pathlib import Path

import torch
from datasets import Dataset, ClassLabel
import numpy as np
from sklearn.metrics import accuracy_score, f1_score
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    EarlyStoppingCallback,
)


def load_jsonl(path: Path) -> Dataset:
    texts, labels = [], []
    with path.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            texts.append(row["text"])
            labels.append(int(row["level"]))
    ds = Dataset.from_dict({"text": texts, "label": labels})
    # Required for stratified splitting in some `datasets` versions.
    return ds.cast_column("label", ClassLabel(num_classes=4))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=Path("training/data/technical_train.jsonl"))
    ap.add_argument("--out", type=Path, default=Path("models/technical"))
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--weight-classes", action="store_true", help="Use inverse-frequency class weights.")
    ap.add_argument("--patience", type=int, default=2, help="Early stopping patience (epochs).")
    ap.add_argument(
        "--save-checkpoints",
        action="store_true",
        help="Save Trainer checkpoints each epoch (uses more disk). Default saves only final model to --out.",
    )
    args = ap.parse_args()

    ds = load_jsonl(args.data)
    # Keep the held-out set representative across levels.
    split = ds.train_test_split(test_size=0.1, seed=args.seed, stratify_by_column="label")
    train_ds, eval_ds = split["train"], split["test"]

    model_name = "distilbert-base-uncased"
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=4)

    def tokenize(batch):
        z = tokenizer(batch["text"], truncation=True, padding="max_length", max_length=256)
        z["labels"] = batch["label"]
        return z

    train_ds = train_ds.map(tokenize, batched=True)
    eval_ds = eval_ds.map(tokenize, batched=True)
    train_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])
    eval_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])

    class_weights: torch.Tensor | None = None
    if args.weight_classes:
        # Inverse-frequency weights (normalized) to reduce bias toward majority class.
        y = np.asarray(train_ds["label"], dtype=np.int64)
        counts = np.bincount(y, minlength=4).astype(np.float64)
        counts = np.maximum(counts, 1.0)
        inv = 1.0 / counts
        inv = inv / inv.sum() * 4.0
        class_weights = torch.tensor(inv, dtype=torch.float32)

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = logits.argmax(axis=-1)
        return {
            "accuracy": accuracy_score(labels, preds),
            "macro_f1": f1_score(labels, preds, average="macro", zero_division=0),
        }

    training_args = TrainingArguments(
        output_dir=str(args.out / "trainer_output"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        eval_strategy="epoch",
        save_strategy="epoch" if args.save_checkpoints else "no",
        save_total_limit=1,
        load_best_model_at_end=bool(args.save_checkpoints),
        metric_for_best_model="macro_f1",
        greater_is_better=True,
        logging_steps=50,
        seed=args.seed,
        warmup_ratio=0.06,
        weight_decay=0.01,
        max_grad_norm=1.0,
        save_safetensors=False,
        report_to="none",
    )

    class WeightedTrainer(Trainer):
        def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
            labels = inputs.get("labels")
            outputs = model(**{k: v for k, v in inputs.items() if k != "labels"})
            logits = outputs.get("logits")
            if labels is None or logits is None:
                raise ValueError("Missing labels/logits in training batch")
            if class_weights is None:
                loss_fct = torch.nn.CrossEntropyLoss()
            else:
                loss_fct = torch.nn.CrossEntropyLoss(weight=class_weights.to(logits.device))
            loss = loss_fct(logits.view(-1, model.config.num_labels), labels.view(-1))
            return (loss, outputs) if return_outputs else loss

    callbacks = []
    if args.save_checkpoints:
        callbacks.append(EarlyStoppingCallback(early_stopping_patience=max(1, int(args.patience))))

    trainer = WeightedTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        compute_metrics=compute_metrics,
        callbacks=callbacks,
    )
    trainer.train()
    metrics = trainer.evaluate()
    print({"final_eval": metrics})

    args.out.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(args.out))
    tokenizer.save_pretrained(str(args.out))
    print(f"Saved model to {args.out}")


if __name__ == "__main__":
    main()
