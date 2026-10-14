import logging

logger = logging.getLogger(__name__)


def poll_once(source):
    try:
        return source.poll()
    except Exception as exc:
        logger.warning("poll failed: %s", exc)
        return None


def fetch_batch(source):
    try:
        return source.fetch_all()
    except Exception as exc:
        logger.warning("fetch failed: %s", exc)
        return []
