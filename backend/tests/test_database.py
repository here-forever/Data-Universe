from sqlalchemy.orm import DeclarativeBase, Session

from app.core.database import Base, get_engine, get_session_factory


def test_base_is_declarative_base() -> None:
    assert issubclass(Base, DeclarativeBase)


def test_engine_uses_settings_database_url() -> None:
    engine = get_engine("sqlite+pysqlite:///:memory:")

    assert str(engine.url) == "sqlite+pysqlite:///:memory:"


def test_session_factory_creates_session() -> None:
    engine = get_engine("sqlite+pysqlite:///:memory:")
    session_factory = get_session_factory(engine)

    session = session_factory()
    try:
        assert isinstance(session, Session)
    finally:
        session.close()
