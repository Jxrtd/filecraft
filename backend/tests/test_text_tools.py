from app.services.text_tools import detect, humanize


def test_humanizer_simplifies_formal_phrasing():
    result = humanize(
        "In order to facilitate the process, individuals do not need to utilize numerous tools."
    )
    assert result == "To help the process, people don't need to use many tools."


def test_detector_returns_complementary_bounded_scores():
    result = detect(
        "I tried the first approach, but it didn't work. So I changed the plan. "
        "The next version was better! Would I use it again? Probably."
    )
    assert 0 <= result["ai_percentage"] <= 100
    assert result["ai_percentage"] + result["human_percentage"] == 100
    assert result["confidence"] == "low"
    assert result["word_count"] > 0
    assert result["signals"]


def test_text_endpoints_validate_and_process(client):
    response = client.post(
        "/api/humanize-text", json={"text": "It is important to note that we cannot utilize it."}
    )
    assert response.status_code == 200
    assert response.json()["text"] == "Notably, we can't use it."
    assert response.headers["cache-control"] == "no-store"

    detection = client.post(
        "/api/detect-ai-text",
        json={"text": "This is a short example. It has two sentences."},
    )
    assert detection.status_code == 200
    assert detection.json()["human_percentage"] + detection.json()["ai_percentage"] == 100

    assert client.post("/api/humanize-text", json={"text": "  "}).status_code == 422
