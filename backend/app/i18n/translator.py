import json
from functools import lru_cache
from importlib.resources import files
from typing import Any


@lru_cache(maxsize=2)
def _messages(locale: str) -> dict[str, str]:
    selected = locale if locale in {"zh-CN", "en-US"} else "zh-CN"
    resource = files("app.i18n.resources").joinpath(f"{selected}.json")
    return json.loads(resource.read_text(encoding="utf-8"))


def render(key: str, locale: str, **values: Any) -> str:
    messages = _messages(locale)
    template = messages.get(key) or _messages("zh-CN").get(key) or key
    return template.format(**values)
