import unittest
from api.services.fit import compute_fit
from api.schemas import FitResult

class TestFitLogic(unittest.TestCase):
    def test_compute_fit_professional_max(self):
        # professional_probability=1.0, expertise_level=3 (Expert)
        res = compute_fit(1.0, 3)
        self.assertEqual(res.fit_score, 100.0)
        self.assertEqual(res.environment_component, 100.0)
        self.assertEqual(res.technical_component, 100.0)

    def test_compute_fit_unprofessional_min(self):
        # professional_probability=0.0, expertise_level=0 (Novice)
        res = compute_fit(0.0, 0)
        self.assertEqual(res.fit_score, 0.0)
        self.assertEqual(res.environment_component, 0.0)
        self.assertEqual(res.technical_component, 0.0)

    def test_compute_fit_mixed(self):
        res = compute_fit(0.5, 2)
        self.assertEqual(res.environment_component, 50.0)
        self.assertEqual(res.technical_component, 66.7)
        self.assertEqual(res.fit_score, 60.9)

    def test_compute_fit_weights(self):
        res = compute_fit(1.0, 0, w_env=0.1, w_tech=0.9)
        self.assertEqual(res.environment_component, 100.0)
        self.assertEqual(res.technical_component, 0.0)
        self.assertEqual(res.fit_score, 10.0)

if __name__ == "__main__":
    unittest.main()
