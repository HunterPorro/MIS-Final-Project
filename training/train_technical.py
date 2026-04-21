"""
Fine-tune DistilBERT on labeled finance answers (topic-prefixed text, 4-class expertise level).
"""
from __future__ import annotations

import json
import argparse
from pathlib import Path

import torch
from datasets import Dataset
from sklearn.metrics import accuracy_score
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
)


def load_jsonl(path: Path) -> Dataset:
    texts, labels = [], []
    with path.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            texts.append(row["text"])
            labels.append(int(row["level"]))
    return Dataset.from_dict({"text": texts, "label": labels})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=Path("training/data/technical_train.jsonl"))
    ap.add_argument("--out", type=Path, default=Path("models/technical"))
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    ds = load_jsonl(args.data)
    split = ds.train_test_split(test_size=0.1, seed=args.seed)
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

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = logits.argmax(axis=-1)
        return {"accuracy": accuracy_score(labels, preds)}

    training_args = TrainingArguments(
        output_dir=str(args.out / "trainer_output"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        logging_steps=50,
        seed=args.seed,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        compute_metrics=compute_metrics,
    )
    trainer.train()

    args.out.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(args.out))
    tokenizer.save_pretrained(str(args.out))
    print(f"Saved model to {args.out}")


if __name__ == "__main__":
    main()
