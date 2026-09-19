# Chromium container sandbox

`chromium-seccomp.json` enables the Linux user namespaces needed by the pinned
Chrome for Testing **153.0.8010.36** on **Linux amd64**, while retaining the Docker
syscall allowlist and Chromium's own renderer sandbox. Apply it only to browser
services (`web` and `worker`). The scheduler does not need it.

## Runtime integration

The browser image creates `/home/nextjs`, owned by UID/GID 1001, and sets `HOME`
there. Chrome's Crashpad configuration needs a writable home; `/app` contains
application artifacts and is root-owned.

Configure browser containers with:

```yaml
cap_drop: [ALL]
security_opt:
  - no-new-privileges:true
  - seccomp:${TFW_CHROMIUM_SECCOMP_PROFILE:?Set the absolute profile path}
```

Set `TFW_CHROMIUM_SECCOMP_PROFILE` to the absolute path of this JSON file in the
deployment artifact. Docker reads it when creating the container; it is not a
secret and does not need a bind mount. Retain the default AppArmor profile. No
host AppArmor/sysctl changes, privileged mode, host capabilities, or browser
sandbox opt-out flags are required by the verified configuration.

## Provenance and permitted differences

The baseline was exported from the resolved OCI seccomp configuration produced
by **Docker Engine 29.8.0**, commit `3ce5872`, on amd64. It represents Docker's
built-in default profile resolved with its normal default capability set. It has
15 rules, `SCMP_ACT_ERRNO` as the default action, and default errno 1 (`EPERM`).
The exported baseline SHA256 is
`412382997705531dda424e30daba4a183175d864da5ea6f96b0f8a0856c87551`.

The checked-in profile retains every baseline rule and appends exactly six
argument-filtered rules. Its SHA256 is
`b12383e94c792810ca3630ed1fcccee9f8f5c121a76cdf4630732d2b4b88d927`.

| Syscall | Argument 0 constraint | Purpose |
| --- | --- | --- |
| `clone` | Namespace bits equal `0x10000000` | New user namespace eligibility probe |
| `clone` | Namespace bits equal `0x30000000` | User and PID namespaces |
| `clone` | Namespace bits equal `0x50000000` | User and network namespaces |
| `clone` | Namespace bits equal `0x70000000` | User, PID and network namespaces |
| `clone` | Namespace bits equal `0x20000000` | Nested renderer PID namespace |
| `unshare` | Exactly `0x10000000` | New user namespace |

The `clone` namespace mask is `0x7e020000` (`2114060288`), covering mount,
cgroup, UTS, IPC, user, PID and network namespace flags. Existing ordinary
thread/process creation rules stay unchanged. New mount, cgroup, UTS and IPC
namespace combinations are not enabled. `setns` stays denied and `clone3` keeps
Docker's `ENOSYS` response. No other syscall is added.

The baseline's `chroot` allowance is intentionally retained: Chromium uses it
inside its newly created user namespace to remove filesystem access. The
container receives no host capabilities. Chromium's zygote can hold capabilities
inside its own user namespace; renderers drop them. Regenerating Docker's
resolved baseline with `cap_drop: ALL` would omit its conditional `chroot` rule
and break that sandbox step.

These choices follow the pinned Chromium
[namespace implementation](https://github.com/chromium/chromium/blob/153.0.8010.36/sandbox/linux/services/namespace_sandbox.cc#L130),
[user namespace eligibility checks](https://github.com/chromium/chromium/blob/153.0.8010.36/sandbox/linux/services/credentials.cc#L245),
and [filesystem isolation](https://github.com/chromium/chromium/blob/153.0.8010.36/sandbox/linux/services/credentials.cc#L48).
The maintained baseline is documented in
[Docker's seccomp documentation](https://docs.docker.com/engine/security/seccomp/)
and implemented in [Moby profiles](https://github.com/moby/profiles/tree/main/seccomp).

## Bounded acceptance check

From the repository root on Linux, set `WEB_IMAGE` to the exact built image ID
or digest. This runs local static content with no network, secrets, published
ports, or application volumes:

```sh
: "${WEB_IMAGE:?Set WEB_IMAGE to the exact built image ID or digest}"
profile_path=$(realpath runtime/chromium-seccomp.json)
docker run --rm --network none --read-only --user 1001:1001 \
  --cap-drop ALL \
  --security-opt no-new-privileges=true \
  --security-opt "seccomp=$profile_path" \
  --tmpfs /home/nextjs:uid=1001,gid=1001,mode=0700,size=33554432 \
  --tmpfs /tmp:uid=1001,gid=1001,mode=0700,size=134217728 \
  --shm-size 256m --memory 768m --cpus 1 --pids-limit 128 \
  --env HOME=/home/nextjs \
  "$WEB_IMAGE" node runtime/browser-smoke.mjs
```

Repeat with the worker image. Expected output includes
`browser.smoke_passed`, `Chrome/153.0.8010.36`, and `uid:1001`.

On 2026-09-19 this check passed for both deployed image digests in disposable
containers under Docker 29.8.0 and kernel 7.0.0-30-generic. The default
`docker-default` AppArmor profile remained enforced. Renderer inspection showed
distinct user/network/PID namespaces, nested PID IDs, zero effective
capabilities, `NoNewPrivs:1`, `Seccomp:2`, and two seccomp filters. Separate
negative probes confirmed `unshare --mount`, `--net`, `--ipc` and `--uts` remained
denied, while `unshare --user` succeeded. All diagnostic containers were removed.

The optional `chrome://sandbox` internal page was unsuitable for this pinned
headless build: navigating there triggered Chromium's own seccomp SIGSYS on
`alarm` (syscall 37). It is not used as the acceptance check; static rendering and
renderer process isolation were verified independently.

The isolated check does not verify application egress policy, provider accounts,
or a newly deployed release. Repeat the application smoke in the actual web and
worker containers after rollout, then perform the separately scoped egress and
provider acceptance checks.

## Updating

When upgrading Docker or Chromium, review the maintained upstream baseline and
the pinned Chromium namespace code. Regenerate the baseline for the target
architecture, retain only the documented six additional rules, compare the
profile changes, and rerun both positive and negative checks. Do not replace this
profile with an unrestricted syscall policy or grant host capabilities to make
a failing browser start.
