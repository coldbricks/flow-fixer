"""Unit tests for classify + generate URL matching."""
from flowfixer.analyze import classify_outcome, is_generate_url


def test_is_generate_image():
    assert is_generate_url(
        "https://aisandbox-pa.googleapis.com/v1/projects/x/flowMedia:batchGenerateImages"
    )


def test_is_generate_video():
    assert is_generate_url(
        "https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoEditVideo"
    )


def test_skip_status():
    assert not is_generate_url(
        "https://aisandbox-pa.googleapis.com/v1/video:batchCheckAsyncVideoGenerationStatus"
    )


def test_classify_ok():
    assert classify_outcome(200, "{}", 2) == "OK"


def test_classify_hard():
    body = "PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC"
    assert classify_outcome(429, body, 287) == "HARD_UNUSUAL"


def test_classify_soft():
    body = "PUBLIC_ERROR_USER_REQUESTS_THROTTLED"
    assert classify_outcome(429, body, 297) == "SOFT_THROTTLE"


def test_classify_hard_by_size():
    assert classify_outcome(429, "", 287) == "HARD_UNUSUAL"


def test_classify_soft_by_size():
    assert classify_outcome(429, "", 297) == "SOFT_THROTTLE"


def test_classify_filter():
    assert (
        classify_outcome(400, "PUBLIC_ERROR_SEXUAL", 100)
        == "FILTER_SEXUAL"
    )
