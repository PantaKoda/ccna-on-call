<!-- Study notes for each topic. Written for this project. Sections are split on the "topic:" markers. -->

<!-- topic: fundamentals -->
## The two models

Networking is described in layers so that each layer only has to solve one problem. The OSI model has seven layers; the TCP/IP model folds them into four or five. You need both sets of names.

| OSI layer | Job | Unit of data | Examples |
| --- | --- | --- | --- |
| 7 Application, 6 Presentation, 5 Session | What the user's program says | Data | HTTP, DNS, SSH, DHCP |
| 4 Transport | End-to-end delivery between programs, identified by port numbers | Segment | TCP, UDP |
| 3 Network | Logical addressing and choosing a path between networks | Packet | IPv4, IPv6, ICMP, routers |
| 2 Data link | Delivery on one local segment, identified by MAC addresses | Frame | Ethernet, 802.11, switches |
| 1 Physical | Bits on a wire, fibre or radio | Bit | Cables, connectors |

## TCP and UDP

- **TCP** sets up a connection (SYN, SYN-ACK, ACK), numbers every segment, acknowledges what arrives and retransmits what is lost. Used where every byte matters: HTTP/HTTPS (80/443), SSH (22), Telnet (23), FTP (20/21), SMTP (25).
- **UDP** just sends. No setup, no acknowledgement, no ordering. Used where speed matters or the application handles loss itself: DNS (53), DHCP (67/68), TFTP (69), NTP (123), SNMP (161), syslog (514), voice and video.

## How a switch forwards frames

1. A frame arrives. The switch learns the **source** MAC address against the port it came in on.
2. It looks up the **destination** MAC address in its table.
3. Known unicast: forward out that one port. Unknown unicast, broadcast or multicast: **flood** out every port in the same VLAN except the one it arrived on.

Each switch port is its own **collision domain**. Each VLAN is one **broadcast domain**; only a router (or layer 3 switch) separates broadcast domains.

## Cabling

- Copper UTP: 100 metres maximum. Cat 5e carries 1 Gb/s, Cat 6 carries 10 Gb/s to about 55 m, Cat 6a to 100 m.
- Multimode fibre: short runs inside a building or campus (hundreds of metres). Single-mode fibre: kilometres.
- CRC errors with late collisions on a link usually mean a **duplex mismatch**.

## IPv6 in one table

| Type | Prefix | Like in IPv4 |
| --- | --- | --- |
| Global unicast | 2000::/3 | Public addresses |
| Unique local | FC00::/7 (FD00::/8 in practice) | Private RFC 1918 addresses |
| Link-local | FE80::/10 | Only valid on the local link; every IPv6 interface has one |
| Multicast | FF00::/8 | Replaces broadcast; FF02::1 is all nodes, FF02::2 all routers |

Shorten an IPv6 address by dropping leading zeros in each group and replacing **one** run of all-zero groups with `::`.

> Private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16. They are not routed on the Internet, which is why NAT exists.

<!-- topic: cli -->
## The modes

IOS is organised in modes, and the prompt tells you which one you are in. A command only works in the mode it belongs to, which is the single most common reason for `% Invalid input`.

| Prompt | Mode | How you get there | What it is for |
| --- | --- | --- | --- |
| `Switch>` | User EXEC | Log in | Looking around; very limited |
| `Switch#` | Privileged EXEC | `enable` | All `show` commands, saving, `ping`, entering configuration |
| `Switch(config)#` | Global configuration | `configure terminal` | Settings for the whole device |
| `Switch(config-if)#` | Interface configuration | `interface g0/1` | Settings for one interface |
| `Switch(config-line)#` | Line configuration | `line console 0`, `line vty 0 4` | Console and remote access lines |

`exit` goes up one level. `end` or Ctrl+Z goes straight back to `#`. To run a `show` command without leaving configuration mode, put `do` in front of it.

## Running and startup configuration

- The **running configuration** lives in RAM. Every command you type changes it immediately, and it is lost at power off.
- The **startup configuration** lives in NVRAM and is loaded at boot.
- `copy running-config startup-config` saves your work. Direction matters: source first, destination second.

## Basic device setup

| Command | What it does |
| --- | --- |
| `hostname NAME` | Names the device; the prompt changes at once |
| `enable secret PASSWORD` | Protects privileged mode, stored as a hash |
| `line console 0` then `password X` and `login` | Asks for a password on the console. Without `login` the password is never asked for |
| `service password-encryption` | Obscures clear-text passwords in the config (weak, type 7) |
| `banner motd #text#` | Legal notice shown before login; the first character is the delimiter |
| `no ip domain-lookup` | Stops the device trying to resolve a typo as a hostname |

## Getting help from IOS

- `?` lists what can come next. `sh?` lists commands starting with "sh".
- Tab completes a word. Any unambiguous abbreviation works: `conf t`, `sh ip int br`, `copy run start`.
- `% Incomplete command` means a keyword is missing. `% Ambiguous command` means the abbreviation matches more than one command. `% Invalid input` with a `^` points at the first character IOS could not accept.

> Common mistakes: typing a `show` command inside configuration mode without `do`; setting a line password but forgetting `login`; configuring for an hour and never saving.

<!-- topic: subnetting -->
## What a mask does

An IPv4 address is 32 bits. The subnet mask (or prefix length) says how many of those bits name the **network**; the rest name the **host** inside it. `/26` means the first 26 bits are network, leaving 6 host bits.

Every subnet has three special values:

- **Network address**: all host bits 0. Names the subnet; not usable by a host.
- **Broadcast address**: all host bits 1. Reaches everyone in the subnet; not usable by a host.
- **Usable hosts**: everything in between, 2 to the power of host bits, minus 2.

## The block-size method

1. Find the **interesting octet**, the one where the mask is neither 255 nor 0.
2. **Block size** = 256 minus the mask value in that octet.
3. Networks start at multiples of the block size. Find the multiple at or below your address: that is the network.
4. The next multiple minus one is the broadcast. First host is network plus one; last host is broadcast minus one.

Example: 192.168.10.77/27. Mask 255.255.255.224, block size 32. Multiples: 0, 32, 64, 96. So the network is .64, the broadcast is .95, and hosts run from .65 to .94.

Example in the third octet: 172.16.37.201/20. Mask 255.255.240.0, block size 16 in the third octet. Multiples: 0, 16, 32, 48. Network 172.16.32.0, broadcast 172.16.47.255.

## The table worth memorising

| Prefix | Mask | Block size | Usable hosts |
| --- | --- | --- | --- |
| /24 | 255.255.255.0 | 256 | 254 |
| /25 | 255.255.255.128 | 128 | 126 |
| /26 | 255.255.255.192 | 64 | 62 |
| /27 | 255.255.255.224 | 32 | 30 |
| /28 | 255.255.255.240 | 16 | 14 |
| /29 | 255.255.255.248 | 8 | 6 |
| /30 | 255.255.255.252 | 4 | 2 |

The same mask values repeat in the third octet: /17 is 128, /18 is 192, /19 is 224, /20 is 240, /21 is 248, /22 is 252, /23 is 254.

A **wildcard mask** is the inverse of a subnet mask (255 minus each octet): /24 is 0.0.0.255, /30 is 0.0.0.3. OSPF and access lists use wildcards.

> Common mistakes: giving a host the network or broadcast address; forgetting to subtract 2; working in the wrong octet for prefixes shorter than /24.

<!-- topic: addressing -->
## Giving an interface an address

A router interface needs three things before it passes traffic: an IP address with a mask, to be enabled, and something live on the other end of the cable.

```
interface g0/0
 ip address 192.168.40.65 255.255.255.224
 no shutdown
```

Router interfaces are **shut down by default**. Switch ports are up by default.

## Reading interface status

`show ip interface brief` is the fastest health check. Read the last two columns together:

| Status | Protocol | Meaning |
| --- | --- | --- |
| up | up | Working |
| administratively down | down | You (or the default) shut it down: `no shutdown` |
| down | down | Layer 1 problem: no cable, or the other end is shut down |
| up | down | Layer 2 problem: mismatch with the neighbour |

## Hosts need three values

- **IP address** and **mask**: decide which addresses are local.
- **Default gateway**: the router's address in the host's own subnet. Anything not local is sent there. A gateway outside the host's subnet is unreachable, so it cannot work.

A host with the right address but a wrong or missing gateway can ping its neighbours and nothing else.

## Managing a layer 2 switch

A layer 2 switch forwards frames without needing an IP address, but you need one to reach it with SSH or monitoring. It goes on a **switch virtual interface** (SVI), not on a physical port:

```
interface vlan 1
 ip address 192.168.1.2 255.255.255.0
 no shutdown
exit
ip default-gateway 192.168.1.1
```

`ip default-gateway` is for devices that do not route. Without it the switch can only answer hosts in its own subnet: pings from elsewhere arrive, but the replies have nowhere to go.

> Common mistakes: forgetting `no shutdown`; a mask on the host that does not match the router's; putting the switch's management address on a physical port.

<!-- topic: switching -->
## Spanning Tree Protocol

Redundant links between switches create loops, and Ethernet frames have no hop limit, so a loop means a broadcast storm. STP blocks just enough ports to leave one loop-free path.

- The switch with the lowest **bridge ID** (priority, then MAC address) becomes the **root bridge**. Default priority is 32768, so set it lower on the switch you want as root.
- Every other switch picks one **root port**: its lowest-cost path to the root.
- Each segment has one **designated port**. Any port that is neither is **blocked**.
- Costs: 10 Mb/s is 100, 100 Mb/s is 19, 1 Gb/s is 4, 10 Gb/s is 2.

Classic STP takes a port through blocking, listening (15 s), learning (15 s) and forwarding. Rapid STP (RSTP, the default as Rapid PVST+ on current switches) converges in a second or two and uses discarding, learning and forwarding.

**PortFast** puts an access port straight into forwarding, for ports with one end device. **BPDU Guard** shuts such a port down (err-disabled) if a switch is ever plugged into it.

## EtherChannel

Several physical links bundled into one logical link: more bandwidth, and STP sees one link so nothing is blocked.

| Protocol | Modes that form a channel |
| --- | --- |
| LACP (IEEE 802.3ad, open standard) | active + active, or active + passive |
| PAgP (Cisco) | desirable + desirable, or desirable + auto |
| Static | on + on |

Two passive (or two auto) ends never form a channel. Member ports must match in speed, duplex, mode and VLANs. Up to 8 active links.

## Discovery protocols

- **CDP**: Cisco proprietary, on by default. `show cdp neighbors` lists directly connected Cisco devices and the ports between you.
- **LLDP**: the vendor-neutral equivalent (IEEE 802.1AB). `lldp run` enables it.

## Wireless essentials

- 2.4 GHz has only three non-overlapping channels: **1, 6 and 11**. 5 GHz has many more and less interference, with shorter range.
- An **autonomous** AP is configured on its own. A **lightweight** AP is managed by a **wireless LAN controller** (WLC) and tunnels to it with **CAPWAP**.
- Security: WPA2 uses AES-CCMP; WPA3 replaces the pre-shared key handshake with **SAE**. WEP and the original WPA are broken.

<!-- topic: vlans -->
## Why VLANs

A VLAN is a separate layer 2 network inside the same switch: its own broadcast domain. Hosts in different VLANs cannot talk to each other without a router, even when they sit on neighbouring ports. VLANs are used to separate teams, limit broadcasts and apply different security rules.

## Access ports

An access port belongs to exactly one VLAN and sends frames untagged; the attached PC never knows a VLAN exists.

```
vlan 10
 name SALES
interface range fa0/1 - 2
 switchport mode access
 switchport access vlan 10
```

A VLAN must **exist** on a switch for that switch to forward it. If you assign a port to a VLAN that has not been created, IOS creates it for you, but with a default name.

## Trunks

A trunk carries many VLANs between switches (or to a router). Each frame gets an **802.1Q tag** naming its VLAN, except frames in the **native VLAN** (VLAN 1 by default), which cross untagged.

```
interface g0/1
 switchport mode trunk
 switchport trunk allowed vlan 10,20
```

- Both ends must be trunks, and both ends must agree on the native VLAN.
- `switchport trunk allowed vlan 10,20` **replaces** the list. To add one more later, use `switchport trunk allowed vlan add 30`; leaving out `add` wipes the others.
- Ports left in `dynamic auto` never form a trunk with each other, because neither side starts the negotiation.

## Check your work

| Command | Shows |
| --- | --- |
| `show vlan brief` | Every VLAN and the access ports in it. Trunk ports are not listed here |
| `show interfaces trunk` | Trunk ports, native VLAN, allowed VLANs and active VLANs |
| `show interfaces fa0/1 switchport` | One port's mode and VLAN |

## When hosts in the same VLAN cannot reach each other

Work along the path: is each host's port in the right VLAN, does the VLAN exist on every switch on the way, is each inter-switch link really a trunk, and is the VLAN in the allowed list on both ends?

> Common mistakes: creating the VLAN on one switch only; a trunk on one end and an access port on the other; replacing the allowed list when you meant to add to it.

<!-- topic: intervlan -->
## The problem

VLANs are separate networks, so each VLAN gets its own IP subnet, and traffic between them must be **routed**. The router's interface in each VLAN is that VLAN's default gateway.

## Router on a stick

One physical router port, connected to a switch trunk, split into **subinterfaces**, one per VLAN:

```
interface g0/0
 no shutdown
interface g0/0.10
 encapsulation dot1q 10
 ip address 192.168.10.1 255.255.255.0
interface g0/0.20
 encapsulation dot1q 20
 ip address 192.168.20.1 255.255.255.0
```

Three things must all be true:

1. The **switch port** facing the router is a trunk that carries those VLANs.
2. The **physical** router interface is up (`no shutdown`) and has no IP address of its own.
3. Each **subinterface** has `encapsulation dot1q <vlan>` and then the gateway address. IOS refuses the IP address until the encapsulation is set.

The number after the dot (`.10`) is only a label. The VLAN is chosen by the `encapsulation` command; matching the two is a convention that keeps configs readable.

## The other way: a layer 3 switch

A multilayer switch can route between VLANs itself with one SVI per VLAN (`interface vlan 10` with an IP address) and `ip routing`. It is faster and is what larger networks use; router on a stick is the low-cost option for small sites.

## Check your work

- On the router: `show ip interface brief` should list each subinterface as up/up with its address.
- On the switch: `show interfaces trunk` should show the uplink trunking and the VLANs allowed.
- From a PC: ping your own gateway first, then a host in the other VLAN.

> Common mistakes: the switch port left as an access port; the wrong VLAN number in `encapsulation dot1q`; PCs whose default gateway is not the subinterface address of their own VLAN.

<!-- topic: l2security -->
## Port security

Port security limits which, and how many, MAC addresses may use an access port. It stops someone unplugging a PC and connecting their own device or a small switch.

```
interface fa0/1
 switchport mode access
 switchport port-security
 switchport port-security maximum 1
 switchport port-security violation restrict
 switchport port-security mac-address sticky
```

- The port must be a **static access port** first; port security is refused on a dynamic port.
- `switchport port-security` on its own turns the feature on. The other lines only set options; without the first line nothing is enforced.
- **Sticky** learning takes the first address seen and writes it into the running configuration, so you do not type MAC addresses by hand.

## Violation modes

| Mode | Frames from an unknown device | Counter and log | Port |
| --- | --- | --- | --- |
| `protect` | Dropped | No | Stays up |
| `restrict` | Dropped | Yes | Stays up |
| `shutdown` (default) | Dropped | Yes | Goes **err-disabled** until someone runs `shutdown` then `no shutdown` |

## Edge port protection

- `spanning-tree portfast`: the port forwards immediately, so a PC gets its DHCP address without waiting 30 seconds.
- `spanning-tree bpduguard enable`: if a BPDU arrives (meaning a switch was connected), the port is err-disabled.

## Unused ports

Shut them down, and ideally move them to an unused VLAN: `interface range fa0/3 - 8` then `shutdown`.

## Check your work

`show port-security` lists secured ports with their limits and violation counts. `show port-security interface fa0/1` gives the detail for one port, including the last address seen.

> Common mistakes: setting the options but never the bare `switchport port-security` line; forgetting `switchport mode access`; leaving the default `shutdown` mode when the request was to keep the port up.

<!-- topic: routing -->
## How a router chooses a route

A router keeps a routing table of destination prefixes. For each packet it does three things in this order.

1. **Longest prefix match.** Of all the routes that match the destination, the most specific wins. A /24 beats a /16, which beats the default route 0.0.0.0/0. This comparison ignores where the route came from.
2. **Administrative distance** decides between routes to the *same* prefix learned from *different* sources. Lower is more trusted.
3. **Metric** decides between routes to the same prefix from the *same* protocol. Lower is better.

| Source | Administrative distance |
| --- | --- |
| Connected | 0 |
| Static | 1 |
| eBGP | 20 |
| EIGRP | 90 |
| OSPF | 110 |
| RIP | 120 |

## Reading the routing table

In `show ip route`, `C` is connected, `L` is the router's own address, `S` is static, `O` is OSPF, and `*` marks the default route. In an entry such as `O 10.2.0.0/24 [110/2] via 10.0.12.2`, the numbers in brackets are administrative distance and metric.

"Gateway of last resort is not set" means there is no default route: a packet with no matching route is dropped and the sender gets an ICMP unreachable.

## Routing is hop by hop, and both ways

Each router decides independently, and a reply needs a route back. A ping that reaches its target but never returns usually means the far side has no route to the source.

## First-hop redundancy

Hosts have one default gateway. If that router fails, they are cut off. A first-hop redundancy protocol such as **HSRP** lets two routers share a **virtual IP and MAC address**: one is active, the other standby. Hosts point at the virtual address and never notice a failover. Default priority is 100; the highest priority becomes active.

> Common mistakes: comparing metrics across different protocols (that is what administrative distance is for); forgetting the return route; expecting a default route to win over a more specific one.

<!-- topic: static -->
## Static routes

A static route tells the router by hand how to reach a network it is not connected to.

```
ip route 10.2.0.0 255.255.255.0 10.0.12.2
```

That reads: to reach 10.2.0.0/24, send to the neighbour at 10.0.12.2. The **next hop** must be an address in a subnet this router is directly connected to. If it is not, the route never appears in the routing table.

## Default routes

A default route matches everything that has no more specific entry:

```
ip route 0.0.0.0 0.0.0.0 203.0.113.1
```

It is the right tool for a **stub** network with only one way out, and for sending Internet traffic toward the ISP. `show ip route` marks it `S*` and reports a "Gateway of last resort".

## Floating static routes

A backup route that only appears when the main one is lost. Add a higher administrative distance at the end:

```
ip route 10.2.0.0 255.255.255.0 10.0.13.2 200
```

While a better route exists (for example OSPF at 110) the floating route stays out of the table.

## Planning static routes

1. On each router, run `show ip route` and list what it already knows (the `C` routes).
2. For each router, list the networks that are missing. Each one needs a route, or a default route that covers it.
3. Check both directions. The return path needs routes too.

A router in the middle of a chain needs routes in both directions. Routers at the ends can often use a single default route.

## Check your work

- `show ip route` on each router: is the route there?
- `ping` from a host, then `tracert` to see how far packets get. The last router that answers is where to look next.

> Common mistakes: a next hop that is not a directly connected neighbour; routes in one direction only; the wrong mask on the destination.

<!-- topic: ospf -->
## What OSPF is

OSPF is a **link-state** routing protocol. Each router describes its own links, floods that description to the others in its area, and every router runs the same shortest-path calculation on the same map. It reacts to failures in seconds and has no hop limit.

- Routers are grouped in **areas**. Area 0 is the backbone; a single-area design puts everything in area 0.
- The metric is **cost**: reference bandwidth (100 Mb/s by default) divided by interface bandwidth, minimum 1. FastEthernet and anything faster both cost 1 unless you raise the reference with `auto-cost reference-bandwidth`.
- Administrative distance is **110**.

## Configuring it

```
router ospf 1
 router-id 1.1.1.1
 network 10.1.0.0 0.0.0.255 area 0
 network 10.0.12.0 0.0.0.3 area 0
 passive-interface g0/0
```

- The process number (`1`) is local to the router; neighbours do not need the same one.
- `network` uses a **wildcard mask**. It selects which interfaces run OSPF and puts them in an area.
- **Router ID**: the configured `router-id`, else the highest loopback address, else the highest active interface address. It must be unique.
- A **passive interface** is still advertised but sends no hellos, so no neighbour can form there. Use it on LANs with only end hosts.
- `default-information originate` advertises this router's default route to the others.

## Becoming neighbours

Two routers on a link become neighbours only if all of these match:

1. Same subnet and mask.
2. Same **area**.
3. Same **hello and dead timers** (10 and 40 seconds by default on Ethernet).
4. **Different** router IDs.
5. Neither interface is passive.
6. Matching authentication, if used.

The goal state is **FULL**. On Ethernet, routers elect a **designated router** (highest priority, then highest router ID) and a backup; the others show as DROTHER.

## Check your work

| Command | Use it to see |
| --- | --- |
| `show ip ospf neighbor` | Who you are adjacent to and in what state. Empty means one of the six conditions fails |
| `show ip protocols` | Router ID, networks advertised, passive interfaces |
| `show ip ospf interface brief` | Which interfaces run OSPF, their area and cost |
| `show ip route` | `O` routes learned from neighbours |

> Common mistakes: an interface missing from the `network` statements; one end in a different area; making the link to a neighbour passive instead of the LAN; a wrong wildcard mask.

<!-- topic: services -->
## Time, logs and monitoring

| Service | Port | What to remember |
| --- | --- | --- |
| **NTP** | UDP 123 | Keeps clocks in sync so logs can be compared. **Stratum** counts hops from the reference clock: a client of a stratum 2 server is stratum 3 |
| **Syslog** | UDP 514 | Sends log messages to a server. Severity runs from 0 (most severe) to 7 |
| **SNMP** | UDP 161, traps on 162 | Monitoring. v1 and v2c use clear-text community strings; **v3** adds authentication and encryption |
| **DNS** | UDP/TCP 53 | Names to addresses. `A` record is IPv4, `AAAA` is IPv6, `MX` is mail, `PTR` is the reverse |
| **TFTP** | UDP 69 | Simple file transfer with no login, used for images and configs |
| **FTP** | TCP 20/21 | File transfer with a login, in clear text |

Syslog severities, from 0 to 7: Emergency, Alert, Critical, Error, Warning, Notice, Informational, Debug. A mnemonic: "Every Awesome Cisco Engineer Will Need Ice cream Daily". Setting a level logs that level and everything more severe.

## Quality of service

When a link is congested, QoS decides what waits and what is dropped.

- **Classification and marking**: identify traffic and label it. **DSCP** is six bits in the IP header and survives across routers. **CoS** is three bits in the 802.1Q tag, so it only exists on trunks.
- **Queuing**: voice goes in a priority queue so it is sent first.
- **Policing** drops or re-marks traffic above a rate. **Shaping** buffers it and sends it later, smoothing bursts.
- Voice needs low delay, low jitter and low loss more than it needs bandwidth.

## Remote management

SSH (TCP 22) encrypts the session. Telnet (TCP 23) sends everything, including passwords, in clear text and should be disabled.

<!-- topic: dhcp -->
## What DHCP does

DHCP hands a host its IP address, mask, default gateway and DNS server automatically. The exchange is four messages, remembered as **DORA**:

1. **Discover**: the client broadcasts "is there a DHCP server?"
2. **Offer**: a server offers an address.
3. **Request**: the client asks for that address.
4. **Acknowledge**: the server confirms the lease.

The client uses UDP port 68 and the server UDP port 67.

## A router as DHCP server

```
ip dhcp excluded-address 192.168.10.1 192.168.10.10
ip dhcp pool STAFF
 network 192.168.10.0 255.255.255.0
 default-router 192.168.10.1
 dns-server 8.8.8.8
```

- **Exclusions are global commands** and should come first. They keep addresses you have assigned by hand (gateways, printers, switches) out of the pool.
- The router chooses the pool whose `network` matches the interface the request arrived on, so one router can serve several LANs with one pool each.
- `default-router` is the gateway handed to clients. Without it, clients get an address but cannot leave their subnet.

## When the server is in another subnet

A Discover is a broadcast, and routers do not forward broadcasts. On the client-facing interface of the clients' router, add a relay:

```
interface g0/0
 ip helper-address 10.0.0.5
```

The router forwards the request as a unicast to that server and relays the answer back.

## Check your work

- On a PC: `ipconfig /all` shows the lease and which server gave it; `ipconfig /renew` asks again.
- On the router: `show ip dhcp binding` lists leases; `show ip dhcp pool` shows each pool.

A Windows PC with a **169.254.x.x** address (APIPA) asked for DHCP and got no answer. That is a symptom of the DHCP path, not an address to troubleshoot from.

> Common mistakes: no `default-router` or the wrong one; a pool whose network does not match the interface subnet; forgetting exclusions so the server hands out the gateway's own address.

<!-- topic: nat -->
## Why NAT

Private addresses (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) are not routed on the Internet. NAT rewrites the source address of packets leaving the network to a public address, and rewrites the replies back.

## The four terms

| Term | Meaning |
| --- | --- |
| Inside local | The host's real, private address |
| Inside global | How that host appears outside (a public address) |
| Outside global | The real address of the remote host |
| Outside local | How the remote host appears inside (usually the same as outside global) |

## Three kinds

- **Static NAT**: one private address mapped permanently to one public address. Also works for connections coming *in*, so it is used to publish a server.
- **Dynamic NAT**: private addresses borrow public ones from a pool, one each.
- **PAT (NAT overload)**: many private addresses share one public address, kept apart by port number. This is what almost every network uses for Internet access.

## Configuring PAT

```
access-list 1 permit 192.168.1.0 0.0.0.255
ip nat inside source list 1 interface g0/1 overload
interface g0/0
 ip nat inside
interface g0/1
 ip nat outside
```

Three pieces are needed, and missing any one means no translation:

1. Interfaces marked `ip nat inside` and `ip nat outside`.
2. An **ACL** that says which inside addresses may be translated.
3. The rule tying the ACL to the outside interface, with `overload`.

A static mapping is one line: `ip nat inside source static 192.168.1.100 203.0.113.5`.

## Check your work

Ping something outside from an inside host, then run `show ip nat translations` on the router. An empty table after traffic was sent means the packets did not match: check the ACL and the inside/outside markings.

> Common mistakes: an inside interface (or subinterface) not marked `ip nat inside`; an ACL that does not cover every inside subnet; leaving out `overload`; NAT working but the router having no default route.

<!-- topic: security -->
## The vocabulary

- A **vulnerability** is a weakness. An **exploit** is a way to use it. A **threat** is someone or something that might. **Mitigation** reduces the risk.
- Security aims to protect **confidentiality, integrity and availability**.
- **Social engineering** attacks people, not machines: phishing (email), spear phishing (targeted), tailgating (following someone through a door).

## AAA

- **Authentication**: who are you?
- **Authorization**: what are you allowed to do?
- **Accounting**: what did you do?

| | TACACS+ | RADIUS |
| --- | --- | --- |
| Transport | TCP 49 | UDP 1812 and 1813 |
| Encrypts | The whole payload | Only the password |
| Typical use | Device administration | Network access (Wi-Fi, VPN, 802.1X) |

Multi-factor authentication combines at least two of: something you know, something you have, something you are.

## Passwords on IOS

- `enable secret` is stored as a hash and wins if both it and `enable password` are set.
- `service password-encryption` only obscures clear-text passwords with weak type 7 encoding. It stops shoulder-surfing, nothing more.
- `username NAME secret PASSWORD` creates a local account with a hashed password.

## Layer 2 attacks and their defences

| Attack | What happens | Defence |
| --- | --- | --- |
| Rogue DHCP server | Hands out a bad gateway to become the on-path device | **DHCP snooping**: server messages are only accepted on trusted ports |
| ARP spoofing | Lies about which MAC owns the gateway's IP | **Dynamic ARP Inspection**, which checks ARP against the snooping table |
| MAC flooding | Fills the switch table so it floods everything | **Port security** |
| Unknown device plugged in | Unauthorised access | Port security; shut down unused ports; 802.1X |

## Firewalls and access lists

A router ACL filters packets by address and port and keeps no memory of connections. A **stateful firewall** tracks connections and allows return traffic automatically. An **IPS** inspects traffic for known attack patterns and can block it.

<!-- topic: acl -->
## What an ACL is

An access list is an ordered list of permit and deny statements. The router compares a packet to each line **from the top down** and stops at the **first match**. Every ACL ends with an invisible `deny ip any any`, so a packet that matches nothing is dropped.

Two consequences: order matters (put specific lines before general ones), and an ACL made only of deny lines blocks everything.

## Standard and extended

| | Standard | Extended |
| --- | --- | --- |
| Matches on | Source address only | Protocol, source, destination, ports |
| Numbers | 1 to 99, 1300 to 1999 | 100 to 199, 2000 to 2699 |
| Place it | Close to the **destination** | Close to the **source** |

A standard ACL cannot tell where traffic is going, so placing it near the source would block that source from everything. An extended ACL is precise enough to drop unwanted traffic early.

## Wildcard masks

A wildcard is the inverse of a subnet mask: 0 bits must match, 1 bits are ignored. `192.168.20.0 0.0.0.255` matches the whole /24. `host 10.0.0.10` is short for `10.0.0.10 0.0.0.0`, and `any` is short for `0.0.0.0 255.255.255.255`.

## Writing and applying one

```
ip access-list extended GUEST-IN
 permit tcp 192.168.20.0 0.0.0.255 host 10.0.0.10 eq 80
 deny ip 192.168.20.0 0.0.0.255 10.0.0.0 0.0.0.255
 permit ip any any
interface g0/1
 ip access-group GUEST-IN in
```

The line format is: action, protocol, source, destination, then an optional port. An ACL does nothing until it is **applied** to an interface with a direction: `in` filters packets arriving on the interface, `out` filters packets leaving it.

To limit who may open SSH or Telnet sessions to the device itself, apply a standard ACL to the lines instead: `access-class 10 in` under `line vty 0 4`.

## Check your work

`show access-lists` shows each line with a **match counter**. Send test traffic and watch which line counts up; that tells you which rule the packet really hit.

> Common mistakes: forgetting the final `permit ip any any` when the goal was to block only some traffic; a general line placed above a specific one; applying the ACL in the wrong direction; forgetting that return traffic passes through ACLs too.

<!-- topic: access -->
## Why SSH

Telnet sends every keystroke, including passwords, in clear text. SSH encrypts the session and is the only acceptable way to manage a device across a network.

## Setting it up

```
hostname HQ-R1
ip domain-name example.lan
username admin secret Str0ngPass
crypto key generate rsa modulus 2048
ip ssh version 2
line vty 0 4
 transport input ssh
 login local
```

Each line has a reason:

1. The RSA key is named after the **hostname and domain name**, so both must be set first. The default hostname is refused.
2. SSH needs a **username**; `secret` stores its password as a hash.
3. `crypto key generate rsa` creates the key pair. At least 768 bits is needed for version 2; use 2048.
4. `ip ssh version 2` refuses the older, weaker version 1.
5. On the **VTY lines** (the remote-access lines), `transport input ssh` refuses Telnet and `login local` checks the local username database instead of a shared line password.

## Restricting who can connect

A standard ACL applied to the VTY lines limits the source addresses allowed to open a session:

```
access-list 10 permit 10.0.99.0 0.0.0.255
line vty 0 4
 access-class 10 in
```

`access-class` protects the device itself. `ip access-group` filters traffic passing through an interface. They are not interchangeable.

## Console and privileged mode

- `line console 0` with `password` and `login` protects the console port.
- `enable secret` protects privileged mode. A remote user cannot enter privileged mode at all on a device that has no enable secret.
- `exec-timeout 5 0` logs out an idle session after five minutes.

## Check your work

From a PC: `ssh -l admin 10.0.99.1` should ask for the password; `telnet 10.0.99.1` should be refused. On the device, `show ip ssh` confirms SSH is enabled and which version.

> Common mistakes: generating keys before setting the domain name; `login` instead of `login local`; forgetting `transport input ssh`, which leaves Telnet open.

<!-- topic: automation -->
## Traditional and controller-based networks

Every network device does three kinds of work:

- **Data plane**: forwarding packets.
- **Control plane**: deciding how to forward (routing protocols, STP, building tables).
- **Management plane**: how you reach and configure it (SSH, SNMP).

In a traditional network each device has its own control plane and is configured one by one. In **software-defined networking** a central **controller** takes over much of the control plane and gives you one place to describe what you want.

- **Southbound interface**: controller to devices. NETCONF, RESTCONF, OpenFlow, SSH.
- **Northbound interface**: applications and scripts to controller. Usually a REST API.

An **underlay** is the physical network that provides reachability; an **overlay** is a virtual network built on top of it with tunnels.

## REST APIs

A REST API uses ordinary HTTP. The verbs map to the four data operations:

| HTTP verb | Operation | Meaning |
| --- | --- | --- |
| POST | Create | Make a new resource |
| GET | Read | Fetch a resource; changes nothing |
| PUT / PATCH | Update | Replace / modify a resource |
| DELETE | Delete | Remove a resource |

Status codes: **200** OK, **201** created, **400** bad request, **401** not authenticated, **403** not allowed, **404** not found, **500** server error.

## Data formats

- **JSON**: `{"hostname": "R1", "interfaces": ["g0/0", "g0/1"]}`. Curly braces hold key/value pairs, square brackets hold lists, strings are in double quotes.
- **XML**: the same data wrapped in tags.
- **YAML**: indentation instead of brackets; used for Ansible playbooks.

## Configuration management tools

| Tool | Agent on the device? | How changes arrive | Language |
| --- | --- | --- | --- |
| Ansible | No (uses SSH) | Push | YAML playbooks |
| Puppet | Usually yes | Pull | Manifests |
| Chef | Usually yes | Pull | Recipes and cookbooks (Ruby) |
| Terraform | No | Push | Declarative files describing the end state |

The benefit is consistency: the same definition is applied to a hundred devices, changes are reviewed like code, and drift from the intended configuration can be detected.

<!-- topic: capstone -->
## A method for broken networks

Guessing wastes time. Work in a fixed order so each check rules something out.

1. **Define the problem.** Who cannot reach what? Does anything work? What changed?
2. **Find how far traffic gets.** From the affected host: `ipconfig`, ping your own gateway, ping the far gateway, ping the target, then `tracert`.
3. **Work up the layers** at the point where it stops.

| Layer | Question | Commands |
| --- | --- | --- |
| 1 Physical | Is the interface up? | `show ip interface brief`, `show interfaces status` |
| 2 Data link | Right VLAN? Trunk carrying it? | `show vlan brief`, `show interfaces trunk` |
| 3 Addressing | Right address, mask and gateway on the host? | `ipconfig /all`, `show ip dhcp binding` |
| 3 Routing | Is there a route there, and a route back? | `show ip route`, `show ip ospf neighbor` |
| 4 and up | Is something filtering or failing to translate? | `show access-lists`, `show ip nat translations` |

## Reading the symptoms

- **169.254.x.x address**: DHCP did not answer. Look at the path between client and server, not at the client's address.
- **Can ping the neighbour but not the gateway**: wrong gateway or mask on the host, or the gateway interface is down.
- **Can ping the gateway but nothing beyond**: routing. Check for a default route and for a return route.
- **Ping works one way only**: an ACL, or a missing return route.
- **Internal works, Internet does not**: default route, then NAT (inside/outside markings and the ACL).

## Building a site from a design

1. Layer 2 first: hostnames, VLANs, access ports, trunks.
2. Then gateways: subinterfaces or SVIs, and check that hosts can ping them.
3. Then services: DHCP, so hosts get addresses on their own.
4. Then routing to the rest of the network.
5. Then management and security: SSH, ACLs, port security.
6. Verify after each step, and **save** at the end.

Fix one thing at a time and re-test. Several faults often hide behind each other, and a change that fixes nothing should be undone before you try the next idea.
