from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ApplicationStatus(str, Enum):
    FOUND = "FOUND"
    ANALYZING = "ANALYZING"
    NEEDS_INPUT = "NEEDS_INPUT"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    SUBMITTED = "SUBMITTED"
    SKIPPED = "SKIPPED"
    FAILED = "FAILED"
    EXTERNAL = "EXTERNAL"


class Job(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str = Field(min_length=1)
    title: str | None = None
    company: str | None = None
    location: str | None = None
    url: str = Field(min_length=1)
    easy_apply: bool = False
    preferences: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    about: str | None = None
    application_url: str | None = None


class Application(BaseModel):
    model_config = ConfigDict(extra="forbid")

    application_id: int
    job_id: str = Field(min_length=1)
    status: ApplicationStatus
    submit_approved: bool = False
    cv_filename: str | None = None
    error_message: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class ApproveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cv_filename: str | None = None


class SetDefaultCVRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str | None = None


class ApplicationQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int | None = None
    application_id: int | None = None
    label: str = Field(min_length=1)
    answer: str | None = None
    field_type: str | None = None
    options: list[str] = Field(default_factory=list)


class SubmitResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ApplicationStatus
    questions: list[ApplicationQuestion] = Field(default_factory=list)
    error_message: str | None = None


class RunConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    keywords: str = ""
    location: str | None = None
    easy_apply: bool = True
    work_type: str | None = None
    max_apply: int | None = Field(default=None, ge=1)
    fill_skill_gaps: bool = False


class AnswerQuestionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answers: dict[str, str] = Field(min_length=1)
