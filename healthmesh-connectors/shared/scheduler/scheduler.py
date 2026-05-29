import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger("shared.scheduler")

class ConnectorScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()

    def start(self):
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("AsyncIOScheduler started successfully.")

    def shutdown(self):
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("AsyncIOScheduler shut down successfully.")

    def add_interval_job(self, func, seconds: int, job_id: str, *args, **kwargs):
        """
        Adds a recurring interval job.
        """
        self.scheduler.add_job(
            func,
            trigger=IntervalTrigger(seconds=seconds),
            id=job_id,
            replace_existing=True,
            args=args,
            kwargs=kwargs
        )
        logger.info(f"Added periodic background job '{job_id}' running every {seconds} seconds.")
