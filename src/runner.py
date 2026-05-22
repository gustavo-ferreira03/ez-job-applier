import asyncio
import time
from urllib.parse import urljoin

from applicant_profile import ApplicantProfile
from db import init_db, is_job_done, save_applied_answers, save_jobs, update_status
from job_applier import JobApplier
from job_collector import JobCollector


class JobProcessor(JobCollector, JobApplier):
    def __init__(self, *args, answer_provider=None, submit_approver=None, events=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.answer_provider = answer_provider
        self.submit_approver = submit_approver
        self.events = events


class RunManager:
    def __init__(self, events, waiters):
        self.events = events
        self.waiters = waiters
        self.run_task = None
        self.loop_task = None
        self.current_config = None
        self._paused = False
        self._wake = asyncio.Event()
        self._next_run_at = None

    def is_running(self):
        return self.run_task is not None and not self.run_task.done()

    def is_loop_active(self):
        return self.loop_task is not None and not self.loop_task.done()

    async def start(self, config):
        if self.is_running() or self.is_loop_active():
            raise RuntimeError("A run is already active")
        self.current_config = config
        self.run_task = asyncio.create_task(self._run(config))

    async def start_loop(self, config):
        if self.is_running() or self.is_loop_active():
            raise RuntimeError("A run is already active")
        self.current_config = config
        self._paused = False
        self._wake.clear()
        self.loop_task = asyncio.create_task(self._loop(config))

    async def cancel(self):
        if self.run_task and not self.run_task.done():
            self.run_task.cancel()
            return True
        return False

    async def pause_loop(self):
        if not self.is_loop_active():
            return False
        self._paused = True
        self._wake.set()
        await self.events.publish({"type": "loop_paused"})
        return True

    async def resume_loop(self):
        if not self.is_loop_active():
            return False
        self._paused = False
        self._wake.set()
        await self.events.publish({"type": "loop_resumed"})
        return True

    async def stop_loop(self):
        if self.loop_task is None or self.loop_task.done():
            return False
        if self.run_task and not self.run_task.done():
            self.run_task.cancel()
        self.loop_task.cancel()
        return True

    async def _loop(self, config):
        interval_secs = int(config.get("loop_interval_minutes", 120)) * 60
        await self.events.publish({"type": "loop_started", "interval_minutes": interval_secs // 60})
        try:
            while True:
                await self._wait_while_paused()

                self.run_task = asyncio.create_task(self._run(config))
                try:
                    await asyncio.wait([self.run_task])
                except asyncio.CancelledError:
                    if not self.run_task.done():
                        self.run_task.cancel()
                        try:
                            await self.run_task
                        except (asyncio.CancelledError, Exception):
                            pass
                    raise

                self._next_run_at = time.time() + interval_secs
                await self.events.publish({
                    "type": "loop_waiting",
                    "next_run_at": self._next_run_at,
                    "interval_minutes": interval_secs // 60,
                })
                await self._sleep_interruptible(interval_secs)
                self._next_run_at = None
        except asyncio.CancelledError:
            self._next_run_at = None
            asyncio.ensure_future(self.events.publish({"type": "loop_stopped"}))
            raise

    async def _wait_while_paused(self):
        while self._paused:
            self._wake.clear()
            if self._paused:
                await self._wake.wait()

    async def _sleep_interruptible(self, total_secs):
        end_time = asyncio.get_running_loop().time() + total_secs
        while True:
            if self._paused:
                self._wake.clear()
                if self._paused:
                    await self._wake.wait()
                continue
            remaining = end_time - asyncio.get_running_loop().time()
            if remaining <= 0:
                break
            self._wake.clear()
            if self._paused:
                continue
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=remaining)
            except asyncio.TimeoutError:
                break

    async def _run(self, config):
        await self.events.publish({"type": "run_started", "config": config})
        try:
            init_db()
            keywords_raw = config.get("keywords") or ""
            keyword_list = [k.strip() for k in keywords_raw.splitlines() if k.strip()] or [None]
            easy_apply = bool(config.get("easy_apply", False))
            max_apply = config.get("max_apply")
            apply_count = 0
            profile = ApplicantProfile()

            async with JobProcessor(
                headless=True,
                answer_provider=self._answer_provider,
                submit_approver=self._submit_approver,
                events=self.events,
            ) as processor:
                await processor.ensure_logged_in()

                for kw in keyword_list:
                    await processor.open_jobs(
                        keywords=kw,
                        location=config.get("location") or None,
                        easy_apply=easy_apply,
                        work_type=config.get("work_type") or None,
                    )
                    search_url = processor.page.url
                    await self.events.publish({"type": "scrape_started", "keyword": kw})

                    job_ids = await processor.load_job_ids()
                    await self.events.publish({"type": "scrape_finished", "count": len(job_ids), "keyword": kw})

                    for job_id in job_ids:
                        if is_job_done(job_id):
                            continue

                        if "/jobs/search/" not in processor.page.url:
                            await processor.page.goto(search_url, wait_until="domcontentloaded")
                            await processor.page.wait_for_timeout(3000)

                        card = processor.page.locator(f'li[data-occludable-job-id="{job_id}"]').first
                        if not await card.count():
                            continue

                        await card.scroll_into_view_if_needed()
                        link = card.locator('a[href*="/jobs/view/"]').first
                        title_raw = await link.inner_text()
                        href = await link.get_attribute("href")
                        labels = [
                            text.strip()
                            for text in await card.locator(".job-card-container__footer-item").all_inner_texts()
                        ]
                        await card.click()
                        await processor.page.wait_for_timeout(1000)
                        card_easy_apply = any("easy apply" in label.lower() for label in labels)

                        job = {
                            "job_id": job_id,
                            "title": title_raw.splitlines()[0].strip(),
                            "company": await card.locator(".artdeco-entity-lockup__subtitle").first.inner_text(),
                            "location": await card.locator(".artdeco-entity-lockup__caption").first.inner_text(),
                            "url": urljoin("https://www.linkedin.com", href),
                            "easy_apply": card_easy_apply,
                        }

                        try:
                            details = await processor.get_job_details(easy_apply=card_easy_apply)
                            job.update(details)
                        except Exception as exc:
                            await self.events.publish({
                                "type": "job_detail_failed",
                                "job_id": job_id,
                                "error": str(exc),
                            })
                            continue

                        save_jobs([job])
                        await self.events.publish({
                            "type": "job_discovered",
                            "job_id": job_id,
                            "title": job["title"],
                            "company": job["company"],
                        })

                        if not card_easy_apply:
                            continue

                        if max_apply and apply_count >= int(max_apply):
                            continue

                        update_status(job_id, "in_progress")
                        await self.events.publish({
                            "type": "application_started",
                            "job_id": job_id,
                            "title": job["title"],
                            "company": job["company"],
                        })

                        try:
                            status, error, answers = await processor.apply_to_job(job, profile)
                        except Exception as exc:
                            status, error, answers = "failed", str(exc), []

                        update_status(job_id, status, error)
                        if answers:
                            save_applied_answers(job_id, answers)

                        await self.events.publish({
                            "type": f"application_{status}",
                            "job_id": job_id,
                            "title": job["title"],
                            "company": job["company"],
                            "error": error,
                        })

                        if status == "applied":
                            apply_count += 1

                await processor.save_session()

            await self.events.publish({"type": "run_finished"})
        except asyncio.CancelledError:
            await self.events.publish({"type": "run_cancelled"})
            raise
        except Exception as exc:
            await self.events.publish({"type": "run_failed", "error": str(exc)})

    async def _answer_provider(self, job, questions):
        return await self.waiters.wait_for_answers({
            "job_id": job["job_id"],
            "title": job["title"],
            "company": job["company"],
            "questions": questions,
        })

    async def _submit_approver(self, job, applied_answers):
        return await self.waiters.wait_for_submit({
            "job_id": job["job_id"],
            "title": job["title"],
            "company": job["company"],
            "applied_answers": applied_answers,
        })

    def state(self):
        return {
            "running": self.is_running(),
            "loop_active": self.is_loop_active(),
            "loop_paused": self._paused,
            "next_run_at": self._next_run_at,
            "current_config": self.current_config,
        }
