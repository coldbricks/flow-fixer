from flowfixer.sanitize import sanitize_har


def test_sanitize_redacts_project_and_credits():
    har = {
        "log": {
            "entries": [
                {
                    "request": {
                        "url": "https://aisandbox-pa.googleapis.com/v1/projects/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/flowMedia:batchGenerateImages",
                        "headers": [{"name": "Cookie", "value": "secret"}],
                        "cookies": [{"name": "sid", "value": "x"}],
                        "queryString": [],
                        "postData": {
                            "text": '{"projectId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","sessionId":";123","recaptchaContext":{"token":"'
                            + ("x" * 200)
                            + '"}}'
                        },
                    },
                    "response": {
                        "status": 200,
                        "headers": [],
                        "cookies": [],
                        "content": {
                            "text": '{"credits":26234,"topUpCredits":1,"subscriptionCredits":2}'
                        },
                    },
                }
            ]
        }
    }
    out, stats = sanitize_har(har, scrub_tokens=True)
    e = out["log"]["entries"][0]
    assert "aaaaaaaa" not in e["request"]["url"]
    assert "PROJECT_ID" in e["request"]["url"] or "redacted" in e["request"]["url"].lower() or "<PROJECT" in e["request"]["url"]
    body = e["request"]["postData"]["text"]
    assert "TOKEN_REDACTED" in body or "<TOKEN" in body or "REDACTED" in body
    assert e["request"]["headers"][0]["value"] == "<<REDACTED>>"
    resp = e["response"]["content"]["text"]
    assert '"credits": 0' in resp or '"credits":0' in resp
    assert stats["entries"] == 1
