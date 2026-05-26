from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from models import Job, RunConfig


class JobSource(ABC):
    name: str

    @abstractmethod
    def discover_jobs(self, config: RunConfig) -> AsyncIterator[Job]:
        pass
