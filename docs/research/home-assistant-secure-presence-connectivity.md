# Secure remote connectivity for Home Assistant presence automation

**Researched:** 2026-08-08  
**Scope:** Home Assistant Cloud (Nabu Casa), Tailscale, Cloudflare Tunnel, and Cloudflare private-network/Mesh options, with emphasis on two iPhones delivering unattended background location updates after both people leave home.  
**Source policy:** First-party Home Assistant, Nabu Casa, Tailscale, and Cloudflare documentation only.

## Executive conclusion

For this household, **Home Assistant Cloud is the best primary connectivity path for presence automation**. It is the only option here that is purpose-built into Home Assistant's mobile-app protocol: a subscribed app registration receives both a `cloudhook_url` and `remote_ui_url`, and the official native-app protocol tells apps to try the Cloudhook first, then the remote UI URL, then the user-supplied instance URL. The Home Assistant host maintains the outbound cloud connection, so neither iPhone needs a separate always-on VPN when iOS wakes the Companion App after a geofence exit. This is the lowest-burden and least fragile answer to the specific “both phones have left home” requirement.

**Cloudflare Mesh and Tailscale are now close peers for this private-network use case.** Tailscale uses direct WireGuard links with encrypted relay fallback; Cloudflare Mesh gives every phone/node a private Mesh IP, routes TCP/UDP/ICMP through Cloudflare, and maps tailnet/subnet-router/ACL concepts to Mesh/Gateway equivalents. For a household whose operator already works at and prefers Cloudflare, **Mesh is the sensible private-network choice over Tailscale**. Both can carry Companion App webhooks, but unattended iOS delivery depends on the respective mobile network client being connected when Home Assistant wakes. That extra mobile dependency remains the main reliability difference from Home Assistant Cloud.

**A public Cloudflare Tunnel** avoids an iPhone VPN and therefore can support unattended background updates through an ordinary HTTPS Home Assistant URL. It is less attractive than Nabu Casa for this use: without Cloudflare Access, the hostname is publicly reachable and relies on Home Assistant authentication plus the secret/encrypted mobile webhook; with Access, unattended Companion App requests should not be assumed to work because Access expects an interactive application token or service-token headers, while Home Assistant's webhook protocol does not define those Cloudflare headers. Cloudflare also terminates the public edge TLS connection, unlike Nabu Casa's documented TCP pass-through/end-to-end TLS design.

**Cloudflare private networking or Cloudflare Mesh** keeps Home Assistant private but reintroduces the same iOS always-on-client dependency as Tailscale, with more policy and routing machinery and traffic routed through Cloudflare rather than direct peer-to-peer. It offers no household presence advantage over Tailscale. Cloudflare WAN/Magic WAN is a site-network product and is disproportionate here.

## First, separate two different jobs

### 1. Remote interactive UI access

This is a person opening the Companion App or browser, authenticating, loading dashboards, and maintaining HTTP/WebSocket traffic. A failed VPN can be noticed and manually repaired. Latency matters; a short startup delay is usually tolerable.

### 2. Unattended mobile webhook/sensor delivery

This is the presence-critical path. iOS wakes the Home Assistant app because a geofence was crossed, a significant location change occurred, or iOS granted a background fetch. The app then makes an HTTP POST to its mobile-app webhook. There is no person present to accept a second login page, reconnect a VPN, or repair an expired device identity.

Home Assistant documents that:

- iOS sends updates on zone entry/exit, significant location changes, app open, and background fetch; zone enter/exit notifications are sent to Home Assistant ([Companion location docs](https://companion.home-assistant.io/docs/core/location/)).
- Background sensor updates are tied to location updates and are scheduled/throttled by iOS; `Always` location permission is required ([Companion troubleshooting](https://companion.home-assistant.io/docs/troubleshooting/faqs/#sensors-are-missing-or-not-updating)).
- The native app POSTs to `<instance_url>/api/webhook/<webhook_id>` without normal Home Assistant authentication. When mobile-app encryption was negotiated, its payload must be encrypted with the registration secret ([Sending data home](https://developers.home-assistant.io/docs/api/native-app-integration/sending-data/)).
- Location data goes directly to the configured Home Assistant instance or through Home Assistant Cloud, depending on app connection settings—not through an unrelated location broker ([Companion location docs](https://companion.home-assistant.io/docs/core/location/)).

The connectivity solution does **not** make iOS geofencing itself perfectly deterministic. It only determines whether the app has a usable path when iOS gives it a background opportunity.

## How each option works

### Home Assistant Cloud (Nabu Casa)

Home Assistant establishes the connection outward to Nabu Casa. For Remote UI, the local instance connects to Nabu Casa's TCP proxy; routing uses SNI and a TCP multiplexer. The proxy forwards encrypted bytes, while the local Home Assistant instance holds the certificate private key and performs TLS decryption. Nabu Casa documents this as end-to-end encryption from device to Home Assistant, even through its servers ([deep dive](https://support.nabucasa.com/hc/en-us/articles/25619268678557), [security aspects](https://support.nabucasa.com/hc/en-us/articles/26508882007581)). Home Assistant's own networking guide describes Cloud as an encrypted smart proxy requiring no inbound home-network traffic ([Companion networking](https://companion.home-assistant.io/docs/troubleshooting/networking/)).

The mobile-app integration is more than Remote UI. A subscribed registration receives a dedicated Cloudhook URL and Remote UI URL. The official request order is Cloudhook first, then a webhook under the Remote UI URL, then the setup URL ([registration response](https://developers.home-assistant.io/docs/api/native-app-integration/setup/#registering-the-device), [sending order](https://developers.home-assistant.io/docs/api/native-app-integration/sending-data/#sending-webhook-data-via-rest-api)). This is the key reason Cloud is well suited to unattended sensor/location traffic.

### Tailscale

Tailscale creates a private overlay network, or tailnet. Each enrolled device receives a stable Tailscale address. Home Assistant can run Tailscale directly, or a subnet router can advertise the home LAN so the iPhones can reach an unchanged LAN address ([quickstart](https://tailscale.com/kb/1017/install), [subnet routers](https://tailscale.com/docs/features/subnet-routers/how-to/setup)).

The data plane uses WireGuard end-to-end encryption. Connections try direct peer-to-peer UDP, then a configured peer relay, then Tailscale's DERP relay. Relay operators only see already-encrypted WireGuard packets ([encryption](https://tailscale.com/docs/concepts/tailscale-encryption), [connection types](https://tailscale.com/kb/1257/connection-types)). Normal operation uses NAT traversal and does not require manual inbound port forwarding; opening UDP can improve the chance of a direct path but relay fallback remains available ([firewall guidance](https://tailscale.com/kb/1181/firewalls)). Grants/ACLs can restrict the two phones to only Home Assistant and its port ([access control](https://tailscale.com/docs/features/access-control)).

On iOS, Tailscale's VPN On Demand can reconnect on cellular, on selected Wi-Fi conditions, or when a `*.ts.net` hostname is requested. Tailscale also installs a broad persistence policy while enabled. Custom rules can accidentally force disconnection, and only one VPN app can have On Demand enabled ([VPN On Demand](https://tailscale.com/kb/1291/ios-vpn-on-demand)). iOS and Android permit only one active VPN, so another VPN is a material conflict ([other VPNs](https://tailscale.com/docs/reference/faq/other-vpns)).

### Cloudflare Tunnel: public hostname

`cloudflared` runs at home and makes outbound-only connections to Cloudflare. A public hostname at Cloudflare is mapped to the local HTTP/HTTPS Home Assistant service. No public home IP or router port forward is required ([Tunnel architecture](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/), [create a tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/), [protocols](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/protocols/)).

The hostname is public unless an Access application protects it; Cloudflare explicitly says anyone can access a newly published route until Access rules are added. Access is deny-by-default once configured and can require an identity-provider login ([published app setup](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)). Automated clients authenticate to Access by adding Cloudflare Client ID/Secret headers ([service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)). Home Assistant's native webhook protocol specifies its own webhook URL and encrypted body, not those headers. Therefore:

- **Tunnel without Access:** ordinary HTTPS is the most plausible Companion App-compatible form, but the Home Assistant login and webhook endpoint are Internet-reachable through Cloudflare.
- **Tunnel with Access:** useful for a browser, but do not treat it as presence-compatible without an explicit end-to-end test. An Access login or service-token requirement can reject a locked-screen background webhook. There is no first-party Home Assistant/Cloudflare document guaranteeing this combination.

Cloudflare presents an edge certificate to the client and may use a second origin certificate between Cloudflare and the origin; these are two separate TLS legs ([Cloudflare TLS concepts](https://developers.cloudflare.com/ssl/concepts/)). Full (strict) verifies and encrypts the origin leg, but Cloudflare remains the HTTP proxy between the two connections ([Full strict](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)). This differs from Nabu Casa's documented TCP proxy where the instance holds the end-to-end Remote UI key.

### The community HAOS Cloudflared app in detail

[`homeassistant-apps/app-cloudflared`](https://github.com/homeassistant-apps/app-cloudflared) is an unofficial, production-stage Home Assistant OS app that packages the real Cloudflare `cloudflared` daemon for `amd64` and `aarch64`. It is absent from Home Assistant's official app repository; installation requires adding the [Unofficial Home Assistant Apps repository](https://github.com/homeassistant-apps/repository). The project originated with Tobias Brenner, remains actively released, and labels itself unofficial. Its app manifest requests the Home Assistant API and read access to Home Assistant configuration, but no host-network or privileged Linux capabilities; it persists app configuration and exposes an optional local metrics port ([app manifest](https://github.com/homeassistant-apps/app-cloudflared/blob/main/cloudflared/config.yaml), [app documentation](https://github.com/homeassistant-apps/app-cloudflared/blob/main/cloudflared/DOCS.md)).

For HAOS on the household ThinkPad, the app can operate in two modes:

- **Locally managed tunnel:** set `external_hostname`, start the app, and follow its Cloudflare authorization URL. The app creates the tunnel and DNS record, and warns that starting it can overwrite an existing DNS record matching the configured hostname. Its docs call this the recommended/simple mode.
- **Remotely managed tunnel:** create the tunnel and published application in the Cloudflare dashboard, set the route's origin to Home Assistant (`http://homeassistant:8123` on the HAOS app network), and put the tunnel token in the app. Cloudflare then owns the route configuration and all other app routing options are ignored. This is slightly more setup but gives clearer dashboard ownership and confines the HAOS-side operational credential to that tunnel. Treat the tunnel token as a secret because it authorizes a connector.

The app connects outward, so the router needs no inbound port. For its default HAOS network, Home Assistant must trust the app network `172.30.33.0/24` and honor `X-Forwarded-For`; current app docs expose these controls under **Settings → System → Network → HTTP server**. The client-to-Cloudflare leg uses public HTTPS, the Cloudflare-to-connector path is the authenticated Tunnel, and the final same-host container-network hop can be HTTP. Cloudflare terminates and can inspect ordinary Home Assistant UI/API HTTPS traffic at its edge; a negotiated encrypted Companion webhook body remains application-encrypted, but metadata such as hostname, URL, timing, and source remains visible.

The app explicitly supports Home Assistant plus optional additional hosts, catch-all forwarding, Nginx Proxy Manager, post-quantum Tunnel mode, and selected `cloudflared` runtime parameters. For least privilege, this household should expose **only Home Assistant**: leave `additional_hosts` empty, do not configure catch-all forwarding, and do not expose the router/NAS examples from the docs. Cloudflare supports proxied WebSockets on all plans, which is necessary for Home Assistant's live frontend; edge deployments can still terminate long-lived sockets and clients must reconnect ([Cloudflare WebSockets](https://developers.cloudflare.com/network/websockets/)).

The crucial compatibility boundary is documented by the app itself: **Cloudflare Access in front of the hostname is incompatible with the Home Assistant Companion App**. Access requires a `CF_Authorization` cookie (or service-token headers for automated clients), and the Companion App cannot be configured to supply that second authentication protocol for every locked-screen webhook. Likewise, whole-host browser challenges, Bot Fight challenges, country blocks, and aggressive rate limits can reject legitimate phone webhooks during travel or carrier changes. For presence use, the practical shape is therefore a normal public Cloudflare HTTPS hostname protected by Home Assistant's own authentication and mobile-webhook secret/encryption—not an Access login page.

This makes the community app materially different from Tailscale/private Cloudflare networking:

- It eliminates the second iOS VPN dependency and should therefore be a better transport for locked-screen geofence delivery.
- It makes the Home Assistant HTTP surface reachable by anyone through Cloudflare, even though the home IP and router remain hidden and closed.
- Cloudflare edge controls reduce origin exposure but must not introduce interactive challenges on Companion traffic.
- Home Assistant updates, unique named users, strong passwords, HA MFA, login throttling/IP bans, careful trusted-proxy configuration, secret tunnel-token handling, and monitoring become the primary controls.

A safe evaluation is reversible: keep the existing remote path, create a dedicated canary hostname and remotely managed tunnel, expose only Home Assistant, verify WebSocket/UI operation, configure only one phone to use the hostname, and run locked-screen exits before moving the second phone. Do not add Access or broad WAF challenges during the transport canary; add narrowly scoped non-interactive edge controls one at a time afterward and repeat background tests.

### Cloudflare private network through Tunnel

The same `cloudflared` connector can advertise a private IP/CIDR instead of a public hostname. Each iPhone enrolls in Cloudflare Zero Trust and installs the Cloudflare One Client VPN profile. WARP/Cloudflare One routes phone-initiated traffic through Cloudflare and down the outbound-only tunnel to Home Assistant. `cloudflared` handles only client-to-server initiated flows; server-initiated traffic uses the server's ordinary route ([private networks](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/), [connect with cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/)). That one-way initiation model is sufficient for an iPhone POSTing a Home Assistant webhook.

This avoids a public hostname, but unattended success requires the Cloudflare client to remain connected. The current product/docs name is **Cloudflare One Client (formerly WARP)**; the iOS/Android enrollment instructions currently call the downloaded mobile app **Cloudflare One Agent**, while package and CLI names remain `cloudflare-warp` and `warp-cli`. Calling it “WARP” is therefore still understandable, but “Cloudflare One Client” is the current umbrella name. iOS setup installs a VPN profile; Cloudflare offers auto-connect and a locked client switch, split-tunnel routing, device enrollment, and Gateway policy ([client downloads](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/download/), [manual enrollment](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/deployment/manual-deployment/), [client settings](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/configure/settings/)). It shares iOS's general single-active-VPN constraint.

### What “Cloudflare mesh” can mean

The phrase has been used ambiguously, so distinguish these products:

1. **Cloudflare Mesh** is now an official product name. It was previously called **WARP Connector** and **peer-to-peer connectivity**. Every enrolled client or Linux mesh node gets a Mesh IP; nodes can advertise subnets; any participant can initiate TCP, UDP, or ICMP. Despite the “mesh” name, Cloudflare says all traffic passes through its network rather than flowing directly peer-to-peer ([Cloudflare Mesh](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/)).
2. **Cloudflare Tunnel private networking** is sometimes loosely described as mesh/VPN replacement, but it is not Mesh: client requests go through Cloudflare to `cloudflared`, and the connector does not provide bidirectional node addressing.
3. **Cloudflare WAN/Magic WAN** connects whole sites through GRE/IPsec/network appliances. It is an enterprise site-network or SD-WAN interpretation of “mesh,” not a sensible two-iPhone Home Assistant solution ([private-network connector comparison](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/)).

For this use, official Cloudflare Mesh would put a Linux mesh node on/near Home Assistant (or advertise the LAN) and enroll both iPhones with the Cloudflare One Client/mobile app. This is substantially the Cloudflare analogue to Tailscale: Cloudflare's own mapping equates a Mesh network to a tailnet, mesh nodes/clients to peers, a routed mesh node to a subnet router, and Gateway network policies/device posture to ACL-style control. The major architectural difference is that Mesh traffic routes through the nearest Cloudflare data center rather than directly between peers. Setup requires enrollment policy, unique device IPs, Gateway proxying, and correct split-tunnel routes; the wizard configures these for new accounts ([Mesh](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/), [Mesh setup](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/get-started/), [client devices](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/client-devices/)). High-availability nodes require multiple Linux hosts; failover helps advertised subnets, not a failed Home Assistant host ([Mesh HA](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/high-availability/)).

## Comparison for two iPhones

| Option | Background exit webhook after both phones leave | Security boundary | Home router inbound ports | Reliability and important failures | Cost | Burden |
|---|---|---|---|---|---|---|
| **Home Assistant Cloud** | **Best fit.** Native Cloudhook/Remote UI fallback; no phone VPN. Both phones independently POST through a path maintained outward by Home Assistant. | Public random cloud endpoints; E2E Remote UI TLS terminates at HA; encrypted mobile payload when negotiated; HA auth/2FA still essential. Nabu Casa warns Remote UI opens HA to the wider Internet. | **None.** | Purpose-built path. Fails on home Internet/power/HA, Nabu Casa outage, Cloud disconnect, subscription lapse, or unsupported/insecure HA version. Nabu Casa may block known-vulnerable versions. | US: **$6.50/month or $65/year**, taxes excluded ([pricing](https://www.nabucasa.com/pricing/)). | **Lowest.** Enable Cloud, set app to Connect via Cloud, maintain updates and account. |
| **Tailscale** | **Good if VPN On Demand is rigorously configured.** Cellular `Always` is safer than relying on a user to toggle it. Each phone's update fails if its VPN is not active. | Private tailnet membership, IdP identity, device keys, least-privilege grants; WireGuard E2E even through relay. | **None required.** Optional UDP opening only improves direct-path performance. | Direct path plus DERP fallback is strong. Failures: phone VPN off, another VPN, key expiry/reauth, ACL error, subnet router/HA node down, captive/restrictive network, control/relay outage. Default new-domain key expiry is 180 days and expired endpoints stop working ([key expiry](https://tailscale.com/docs/features/access-control/key-expiry)). | Personal plan is **$0**, up to 6 users; unlimited user devices ([pricing](https://tailscale.com/pricing)). | **Medium.** Client/server installs, IdP/MFA, grants, MagicDNS or subnet routes, On Demand on both phones, key lifecycle and updates. |
| **Cloudflare Tunnel, public** | **Likely good only as plain HTTPS without an Access challenge.** No phone VPN. Access/service-token protection can break unattended posts unless proven otherwise. | Public Cloudflare edge; HA auth plus secret/encrypted webhook. Cloudflare terminates edge TLS. Optional Access adds identity but is not natively represented in HA webhook requests. | **None.** | Fails on `cloudflared`, home Internet/HA, Cloudflare edge/Tunnel/DNS, certificate/domain, route/proxy mistakes, or Access session expiry. Multiple connectors can add tunnel redundancy but not HA-host redundancy. | A free Cloudflare plan/Zero Trust proof of concept is available; own-domain registration is separate. Confirm current plan limits before adoption ([Free plan](https://www.cloudflare.com/plans/free/), [account limits](https://developers.cloudflare.com/cloudflare-one/account-limits/)). | **Medium-high.** Domain/DNS, daemon lifecycle, proxy/trusted-proxy correctness, security rules, Access compatibility testing, logs and updates. |
| **Cloudflare Tunnel, private route** | **Good only while Cloudflare One Agent is connected.** Same extra-client risk class as Tailscale. | Private enrolled devices, Cloudflare identity/device/Gateway policy. Traffic traverses Cloudflare to `cloudflared`; no public HA hostname required. | **None.** | Client VPN off, re-enrollment/session/policy issue, split-route error, `cloudflared` down, CF outage, captive network, another VPN. | Free proof of concept available; seat and feature limits are plan-dependent. | **High.** Zero Trust enrollment, iOS VPN profiles, routes, policies, connector and client operation. |
| **Cloudflare Mesh** | **Good while the Cloudflare One Client is connected.** Functionally close to Tailscale and preferable when Cloudflare familiarity/ownership reduces operational burden. | Enrolled Mesh IPs, Gateway policies/posture; encrypted networking routed through Cloudflare, not direct P2P. HA HTTPS can preserve application-payload encryption end to end. | **None.** | Phone client off, policy/split-tunnel error, node or CF outage, enrollment issue, another VPN. HA node failure remains. HA mesh-node route can use active/passive replicas if separately deployed. | Available for a free proof of concept; official default limits include 50 Mesh nodes and 1,000 shared routes, but check current seat/plan entitlement ([limits](https://developers.cloudflare.com/cloudflare-one/account-limits/)). | **Medium-high for a Cloudflare operator.** Linux node, client enrollment, Mesh routes/IPs, Gateway proxy/policies, split tunnel, lifecycle/HA decisions. |

### What changes when both phones leave simultaneously?

Nothing special happens at the server for any option: Home Assistant remains at home and each phone independently tries to send its exit update. The important distinction is the number of independent prerequisites on each phone:

- **Cloud and public Tunnel:** iOS only needs network service plus the Home Assistant app's background opportunity. No second mobile network extension has to be healthy.
- **Tailscale and Cloudflare private/Mesh:** iOS needs the Home Assistant wake **and** a working VPN/network-extension path. With two phones, either phone can independently become stale, creating asymmetric presence (`person_a: not_home`, `person_b: home`) even though both left.

This matters more to automation reliability than whether interactive dashboards load quickly when manually opened.

## Security assessment

### Home Assistant Cloud

Strengths:

- Purpose-built E2E Remote UI encryption; certificate private key stays on Home Assistant.
- Outbound connection; no exposed home router port.
- Mobile Cloudhook and encrypted payload support are native protocol features.
- Nabu Casa says it has no administrative path into the instance and only forwards encrypted traffic ([Nabu Casa privacy](https://www.nabucasa.com/privacy/), [access FAQ](https://support.nabucasa.com/hc/en-us/articles/26177731023261)).

Tradeoffs:

- The Remote UI/login surface is Internet-reachable, even though the home IP/port is not. Use unique strong passwords, HA 2FA for every account, prompt updates, and do not treat the random hostname as the sole secret. Nabu Casa explicitly recommends password and 2FA controls ([security aspects](https://support.nabucasa.com/hc/en-us/articles/26508882007581)).
- Cloud, DNS, certificate issuance, and Nabu Casa availability are dependencies.

### Tailscale

Strengths:

- The HA endpoint is not public. Authentication and authorization happen at tailnet membership/policy, in addition to HA login.
- WireGuard E2E encryption remains intact through relays; least-privilege rules can expose only HA.
- No TLS-terminating application proxy is required.

Tradeoffs:

- A compromised, over-permitted tailnet device can reach permitted private services. Enable IdP MFA, device approval if desired, least-privilege grants, prompt client updates, and remove lost devices ([Tailscale security practices](https://tailscale.com/docs/reference/best-practices/security)).
- Plain HTTP inside the tailnet is encrypted by Tailscale but browsers do not authenticate the web service itself; Tailscale recommends HTTPS for internal web tools and warns HTTP services about DNS rebinding. Preserve Home Assistant host validation and/or HTTPS rather than equating network encryption with application identity.

### Cloudflare choices

Strengths:

- All variants avoid a router port forward.
- Public Tunnel conceals the origin and can apply Cloudflare edge controls.
- Private Tunnel/Mesh limits network access to enrolled clients and can apply Gateway identity/device policies.

Tradeoffs:

- Public Tunnel makes Cloudflare an application-layer TLS endpoint. Full (strict) secures both legs but is not one TLS session from iPhone to HA.
- Adding Access strengthens browser access but introduces a second authentication protocol that unattended HA webhooks do not natively describe. Bypassing Access for `/api/webhook/*` restores unattended reachability but makes possession of the webhook URL/registration encryption the control for that route; that is a security design requiring careful validation, not a free compatibility fix.
- Private/Mesh avoids public exposure but depends on a Cloudflare mobile VPN and more account policy. Cloudflare says Mesh traffic passes through its network.

## Recommendation

1. **Use Home Assistant Cloud as the primary Companion App external path for both iPhones and keep remote access continuously available.** Do not automate turning Remote UI on only after everyone leaves: the exit webhook itself needs a working remote path, creating a bootstrap race. The subscription buys the most important property here—native unattended delivery without a second iOS VPN dependency—plus the lowest maintenance burden.
2. **Use Home Assistant 2FA, unique strong user passwords, prompt Core/OS/app updates, and separate named HA users for each person.** Cloud is not a substitute for HA authentication.
3. **Given this household's Cloudflare preference and operator familiarity, choose Cloudflare Mesh—not Tailscale—for the private administrative/diagnostic path.** It is now close enough to Tailscale in capability that organizational familiarity is a legitimate deciding factor. Use a dedicated Linux mesh node or carefully scoped subnet route, permit only the two phones to the Home Assistant service, and use HA HTTPS rather than assuming network encryption alone satisfies Companion App remote-URL requirements.
4. **Mesh can become the primary presence path only after the locked-screen test matrix proves the Cloudflare client remains connected through reboot, idle time, and Wi-Fi/cellular transitions on both phones.** If it passes over one to two weeks, preferring Mesh is reasonable. If the overriding goal is maximum unattended presence reliability with minimum maintenance, keep Home Assistant Cloud primary because it removes the second iOS client dependency. Avoid public Cloudflare Tunnel plus Access for the webhook path unless that exact unattended flow is proven.

## Safe, reversible test plan

No configuration was changed during this research. When ready to test:

1. **Record the baseline.** Export/screenshot each iPhone's Companion App server Connection, Privacy, Sensors, and Location settings. Record current `device_tracker`, `person`, and `sensor.last_update_trigger` entity names. Take a Home Assistant backup. Do not remove the existing remote path.
2. **Harden first.** Confirm both HA accounts have unique strong passwords and 2FA; update Home Assistant and both iOS apps; confirm iOS location permission is `Always` and the desired Exact versus Zone Name Only privacy level. Keep location services and cellular data enabled.
3. **Canary one phone.** Enable the candidate path for only one iPhone first. Keep a local browser session and the old remote route available so a failed experiment cannot lock out administration.
4. **Prove webhook delivery, not merely UI loading.** With the phone locked, cross the Home zone. Record the iOS event time, HA state-change time, `last_update_trigger`, and whether associated sensors update. A dashboard that opens after manually launching the VPN is not a passing background test.
5. **Run the household matrix:**
   - phone A leaves while B remains home;
   - phone B leaves while A remains home;
   - both leave together with screens locked and Wi-Fi transitioning to cellular;
   - both return together;
   - repeat from an unfamiliar Wi-Fi network and on cellular only;
   - repeat after an iPhone reboot and after several idle hours.
6. **For a VPN candidate, add explicit failure tests.** Verify On Demand/auto-connect after reboot, Wi-Fi-to-cellular handoff, captive-portal recovery, and key/session reauthentication. Confirm behavior when any other household VPN is enabled. A single missed locked-screen exit is a serious negative signal for presence-primary use.
7. **Test common infrastructure failures safely.** Stop only the candidate connector briefly while someone remains home, verify the mobile state becomes stale rather than falsely changing, restore it, and confirm recovery. Do not test by cutting power if HA controls safety-critical equipment.
8. **Make automations fail safe.** During the trial, have “everyone away” produce a notification/log entry rather than locking doors, disabling climate protection, opening/closing barriers, or arming/disarming security. Require both trackers to be `not_home` for a dwell period and reject stale/unavailable tracker data. Presence should never be the sole condition for life-safety or access-control actions.
9. **Observe for at least one to two weeks** across ordinary routines, low-power mode, poor cellular coverage, and app updates. Compare webhook latency and missed exits, not just subjective UI speed.
10. **Promote or roll back.** If Cloud is reliable, move the second phone to it and retain the old path temporarily. If any candidate misses updates, restore the documented baseline and use Companion App troubleshooting/location history before changing another variable.

## Primary sources

### Home Assistant and Nabu Casa

- [Companion App networking](https://companion.home-assistant.io/docs/troubleshooting/networking/)
- [Companion App location](https://companion.home-assistant.io/docs/core/location/)
- [Companion App troubleshooting](https://companion.home-assistant.io/docs/troubleshooting/faqs/)
- [Native app registration](https://developers.home-assistant.io/docs/api/native-app-integration/setup/)
- [Native app sending data/webhook encryption](https://developers.home-assistant.io/docs/api/native-app-integration/sending-data/)
- [Home Assistant Cloud integration](https://www.home-assistant.io/integrations/cloud/)
- [Nabu Casa Remote Access deep dive](https://support.nabucasa.com/hc/en-us/articles/25619268678557)
- [Nabu Casa Remote Access security](https://support.nabucasa.com/hc/en-us/articles/26508882007581)
- [Nabu Casa privacy](https://www.nabucasa.com/privacy/)
- [Nabu Casa pricing](https://www.nabucasa.com/pricing/)

### Tailscale

- [Quickstart](https://tailscale.com/kb/1017/install)
- [Encryption](https://tailscale.com/docs/concepts/tailscale-encryption)
- [Connection types and relay fallback](https://tailscale.com/kb/1257/connection-types)
- [VPN On Demand for iOS](https://tailscale.com/kb/1291/ios-vpn-on-demand)
- [Other VPN limitations](https://tailscale.com/docs/reference/faq/other-vpns)
- [Firewall/NAT behavior](https://tailscale.com/kb/1181/firewalls)
- [Access control](https://tailscale.com/docs/features/access-control)
- [Key expiry](https://tailscale.com/docs/features/access-control/key-expiry)
- [Pricing](https://tailscale.com/pricing)

### Cloudflare

- [Cloudflare Tunnel architecture](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- [Published Tunnel applications](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/)
- [Cloudflare Access self-hosted apps](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
- [Private networks and connector comparison](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/)
- [Private networking with cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/)
- [Cloudflare One Client settings](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/configure/settings/)
- [Cloudflare Mesh](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/)
- [Mesh client devices](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/client-devices/)
- [Cloudflare TLS concepts](https://developers.cloudflare.com/ssl/concepts/)
- [Cloudflare One account limits](https://developers.cloudflare.com/cloudflare-one/account-limits/)
