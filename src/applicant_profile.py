import json
import re
from pathlib import Path


class ApplicantProfile:
    def __init__(self, path="profile.json"):
        self.path = Path(path)
        self.answers = self.load()

    def load(self):
        if not self.path.exists():
            return {}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self):
        self.path.write_text(json.dumps(self.answers, ensure_ascii=False, indent=2), encoding="utf-8")

    def key(self, question):
        return re.sub(r"\W+", "_", question.lower()).strip("_")

    def get_answer(self, question, options=None):
        key = self.key(question)
        if options and self.answers.get(key) not in options:
            return None
        return self.answers.get(key)

    def set_answer(self, question, answer):
        self.answers[self.key(question)] = answer
        self.save()

    def answer_for(self, question, options=None):
        answer = self.get_answer(question, options)
        if answer is None:
            raise KeyError(f"No saved answer for '{question}'")
        return answer
