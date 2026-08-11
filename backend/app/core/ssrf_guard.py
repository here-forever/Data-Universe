from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable, Iterable
from urllib.parse import urlsplit


class UnsafeUrlError(ValueError):
    pass


AddressResolver = Callable[[str, int], Iterable[str]]

BLOCKED_NETWORKS = tuple(
    ipaddress.ip_network(network)
    for network in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "224.0.0.0/4",
        "240.0.0.0/4",
        "::/128",
        "::1/128",
        "fc00::/7",
        "fe80::/10",
        "ff00::/8",
    )
)


def resolve_host_addresses(hostname: str, port: int) -> tuple[str, ...]:
    try:
        records = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise UnsafeUrlError("base_url host could not be resolved") from error
    addresses = tuple(dict.fromkeys(record[4][0] for record in records))
    if not addresses:
        raise UnsafeUrlError("base_url host could not be resolved")
    return addresses


def validate_outbound_https_url(
    url: str,
    *,
    resolve_dns: bool = False,
    resolver: AddressResolver | None = None,
) -> str:
    parsed = urlsplit(url)
    if parsed.scheme.lower() != "https":
        raise UnsafeUrlError("base_url must use https")
    if not parsed.hostname:
        raise UnsafeUrlError("base_url must include a host")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise UnsafeUrlError("base_url cannot contain credentials, a query, or a fragment")
    try:
        port = parsed.port or 443
    except ValueError as error:
        raise UnsafeUrlError("base_url contains an invalid port") from error

    hostname = parsed.hostname.rstrip(".").lower()
    if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")):
        raise UnsafeUrlError("base_url must not target a local host")

    try:
        literal_address = ipaddress.ip_address(hostname)
    except ValueError:
        addresses = (resolver or resolve_host_addresses)(hostname, port) if resolve_dns else ()
    else:
        addresses = (str(literal_address),)

    for raw_address in addresses:
        address = ipaddress.ip_address(raw_address.split("%", 1)[0])
        if _is_blocked(address):
            raise UnsafeUrlError("base_url must not target a private or reserved address")
    return url.rstrip("/")


def _is_blocked(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    explicitly_blocked = any(
        address in network for network in BLOCKED_NETWORKS if network.version == address.version
    )
    return explicitly_blocked or not address.is_global
