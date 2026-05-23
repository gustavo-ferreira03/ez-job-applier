from abc import ABC, abstractmethod

from models import AnalyzeResult, Application, ApplicationQuestion, Job, SubmitResult


class BaseApplier(ABC):
    name: str
    priority: int = 0

    @abstractmethod
    def matches(self, job: Job) -> bool:
        pass

    @abstractmethod
    async def analyze(
        self,
        application: Application,
        job: Job,
        questions: list[ApplicationQuestion],
    ) -> AnalyzeResult:
        pass

    @abstractmethod
    async def submit(
        self,
        application: Application,
        job: Job,
        questions: list[ApplicationQuestion],
    ) -> SubmitResult:
        pass
