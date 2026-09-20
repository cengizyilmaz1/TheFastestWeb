#!/usr/bin/env python3
"""Reconcile only the shared screenshot resources after Coolify restarts.

Run as root with --renderer/--central resource UUIDs. Host firewall containment
must already cover renderer egress/backend and its Coolify managed subnet.
The application web/proxy networks are intentionally outside this allowlist.
"""
import argparse
import json
import re
import subprocess


def docker(*args):
    result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=15)
    if result.returncode:
        if args[:2] == ("network", "inspect") and re.search(r"No such network|network .+ not found", result.stderr, re.IGNORECASE):
            return None
        raise RuntimeError("Docker request failed during shared screenshot network reconciliation")
    return result.stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--renderer", required=True)
    parser.add_argument("--central", required=True)
    args = parser.parse_args()
    if not all(re.fullmatch(r"[a-z0-9]{16,40}", value) for value in [args.renderer, args.central]):
        parser.error("Invalid resource UUID")
    renderer_name = "screenshot-worker-" + args.renderer
    networks = [
        args.renderer, args.central,
        "indietools-screenshot-control", "indietools-screenshot-backend",
        "indietools-screenshot-egress", "shared-screenshots-backend",
        "shared-screenshots-api-egress",
    ]
    for network in networks:
        data = docker("network", "inspect", network)
        if data is None:
            continue
        detail = json.loads(data)[0]
        for container in detail.get("Containers", {}).values():
            name = container["Name"]
            remove_proxy = name == "coolify-proxy"
            remove_renderer_extra_network = network == args.renderer and name == renderer_name
            if remove_proxy or remove_renderer_extra_network:
                if docker("network", "disconnect", network, name) is None:
                    raise RuntimeError("Shared screenshot network reconciliation failed")
                print(json.dumps({"event": "screenshot.network_detached", "network": network, "container": name}))


if __name__ == "__main__":
    main()
