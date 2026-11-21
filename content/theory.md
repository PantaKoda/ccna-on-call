<!-- Study notes for each topic. Written for this project. Sections are split on the "topic:" markers.
     A heading ending in {v1} or {v2} belongs to that exam version only. -->

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

## Cables

| Cable | Reach | Notes |
| --- | --- | --- |
| Copper UTP, Cat 5e | 100 m | 1 Gb/s |
| Copper UTP, Cat 6 / 6a | 100 m | 10 Gb/s to about 55 m on Cat 6, the full 100 m on Cat 6a |
| Multimode fibre | Hundreds of metres | Inside a building or campus; cheaper optics |
| Single-mode fibre | Kilometres | Between buildings and sites; needs matching optics |

- Ethernet over copper uses pins **1, 2** and **3, 6** at 10 and 100 Mb/s, and all four pairs at 1 Gb/s.
- A **straight-through** cable joins unlike devices (PC to switch, switch to router). A **crossover** cable joins like devices (switch to switch, PC to PC). Modern ports detect this themselves (auto-MDIX), so the wrong type only matters on old equipment.
- Fibre needs both ends to use the same type and wavelength, and the transmit strand of one end to reach the receive strand of the other. `show interfaces transceiver` reports the light levels in dBm; a receive level below the optic's minimum means a dirty connector, a bent or over-long fibre, or mismatched optics.

## Reading interface errors

`show interfaces g0/1` counts what went wrong on a link:

| Counter | Usual cause |
| --- | --- |
| CRC, input errors | Damaged frames: bad cable, interference, or a duplex mismatch |
| Collisions | Normal only on half duplex |
| **Late collisions** | A **duplex mismatch** (one end full, one end half), or a cable that is too long |
| Runts and giants | Frames shorter than 64 or longer than 1518 bytes: a faulty network card or a mismatch |
| Output drops | The link is congested |

Speed and duplex should be auto on both ends, or fixed identically on both. One end fixed and the other auto usually ends as a duplex mismatch: the link comes up, works slowly, and the half-duplex side counts late collisions. A **speed** mismatch is easier to spot, because the link does not come up at all.

## Network designs {v1}

- **Two-tier (collapsed core)**: access switches connect to a combined core and distribution layer. Typical for one building.
- **Three-tier**: access, distribution and core as separate layers, for large campuses.
- **Spine-leaf**: every leaf switch connects to every spine, used in data centres for predictable paths.
- **WAN**, **small office/home office** and **cloud** designs connect sites and services beyond the campus.

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

<!-- topic: ipv6 -->
## Reading an IPv6 address

An IPv6 address is 128 bits, written as eight groups of four hexadecimal digits. Two rules shorten it:

1. Drop leading zeros in each group: `0db8` becomes `db8`, `0000` becomes `0`.
2. Replace **one** run of all-zero groups with `::`. Only once, or the address would be ambiguous.

`2001:0db8:0000:0000:0000:ff00:0042:8329` becomes `2001:db8::ff00:42:8329`.

## Address types

| Type | Prefix | Used for |
| --- | --- | --- |
| Global unicast | 2000::/3 | Routable on the Internet, like public IPv4 |
| Unique local | FC00::/7 (FD00::/8 in practice) | Inside one organisation, like private IPv4 |
| Link-local | FE80::/10 | Only on the local link. Every IPv6 interface has one, and routing protocols use it as the next hop |
| Multicast | FF00::/8 | One to many. FF02::1 is all nodes, FF02::2 is all routers. IPv6 has no broadcast |
| Loopback | ::1/128 | The host itself |

## Prefix sizes

- **/64** for every LAN. The first 64 bits are the network, the last 64 the interface ID. SLAAC only works with /64.
- **/127** (or /126) on point-to-point links between routers.
- **/128** is a single host, used for loopbacks and host routes.
- **/48** is a typical allocation to one site, which leaves 16 bits to number 65,536 /64 subnets. A /56 gives 256 of them.

To count subnets, subtract the prefix you were given from the prefix you will use: from a /48, /64 subnets use 16 bits, so 2 to the power of 16.

## Modified EUI-64

A host can build its own 64-bit interface ID from its 48-bit MAC address:

1. Split the MAC in half: `0012.34` and `56.789a`.
2. Insert `FFFE` in the middle: `0012:34FF:FE56:789A`.
3. Flip the seventh bit of the first byte (the universal/local bit): `00` becomes `02`.

Result: `0212:34FF:FE56:789A`. With the prefix `2001:db8:1:1::/64` the address is `2001:db8:1:1:212:34ff:fe56:789a`. Spot an EUI-64 address by the `ff:fe` in the middle.

## How a host gets an address

- **Static**: typed in by hand.
- **SLAAC**: the router advertises the /64 prefix and the host builds the rest itself.
- **DHCPv6**: a server hands out the address (stateful) or only extras such as DNS (stateless).

Neighbour Discovery (NDP) replaces ARP. Neighbour solicitation and advertisement find MAC addresses; router solicitation and advertisement find the gateway and prefix.

## Configuring a router

```
ipv6 unicast-routing
interface g0/0
 ipv6 address 2001:db8:1:1::1/64
 no shutdown
interface g0/1
 ipv6 address 2001:db8:1:2::/64 eui-64
```

Without `ipv6 unicast-routing` the router has addresses but does not forward IPv6 packets or send router advertisements.

## IPv6 static routes

The same four kinds as IPv4, with `ipv6 route`:

| Kind | Example |
| --- | --- |
| Network | `ipv6 route 2001:db8:2::/64 2001:db8:12::2` |
| Default | `ipv6 route ::/0 2001:db8:12::2` |
| Host | `ipv6 route 2001:db8:2::10/128 2001:db8:12::2` |
| Floating | `ipv6 route 2001:db8:2::/64 2001:db8:13::2 200` |

If the next hop is a link-local address you must also name the exit interface, because the same FE80:: address can exist on every link.

## Check your work

`show ipv6 interface brief` lists each interface with its link-local and global addresses. `show ipv6 route` shows the table (`C` connected, `L` local, `S` static). From a host, `ping` and `tracert` accept IPv6 addresses.

> The simulator in this game does not run IPv6 yet, so this topic is theory and questions only. Common mistakes: using `::` twice; forgetting `ipv6 unicast-routing`; a link-local next hop without the exit interface.

<!-- topic: virtualization -->
## Why virtualize

One physical server used to run one operating system and mostly sat idle. Virtualization lets one machine run many isolated workloads, which saves hardware, power and time: a new server becomes a file you copy.

## Hypervisors and virtual machines

A **hypervisor** shares a physical host's CPU, memory, storage and network cards between **virtual machines** (VMs). Each VM has its own full operating system and believes it has its own hardware.

| | Type 1 (bare metal) | Type 2 (hosted) |
| --- | --- | --- |
| Runs on | The hardware directly | An ordinary operating system |
| Used for | Data centres and servers | Labs and desktops |
| Examples | VMware ESXi, Microsoft Hyper-V, KVM | VirtualBox, VMware Workstation |

## Containers

A **container** packages one application with its libraries and shares the host's operating system kernel instead of bringing its own.

| | Virtual machine | Container |
| --- | --- | --- |
| Contains | A whole operating system | One application and its dependencies |
| Size and start time | Gigabytes, tens of seconds | Megabytes, about a second |
| Isolation | Strong: separate kernels | Lighter: shared kernel |
| Managed by | A hypervisor | A container engine such as Docker, often orchestrated by Kubernetes |

## How they reach the network

- Each VM has a **virtual NIC** with its own MAC address.
- The hypervisor runs a **virtual switch** that connects the virtual NICs to each other and to the host's physical NICs.
- VMs on one host often sit in different VLANs, so the switch port facing the host is usually a **trunk**, and frequently several ports bundled in an EtherChannel.

To the physical network, a host with twenty VMs looks like twenty MAC addresses behind one port. That matters for port security limits and for the allowed VLAN list on the trunk.

## Virtual routing and forwarding {v1}

A **VRF** gives one router several separate routing tables, so two customers can use the same addresses without clashing. It does at layer 3 what a VLAN does at layer 2.

> Common mistakes: an access port (one VLAN) toward a host that carries VMs in several VLANs; a port security maximum of 1 on a virtualization host port.

<!-- topic: clients -->
## The four things a host needs

To reach anything, a host needs an **IP address**, a **subnet mask**, a **default gateway** in its own subnet, and a **DNS server**. Most client problems are one of these being wrong or missing, so look at them before anything else.

## The same check on three systems

| Task | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Show address, mask, gateway | `ipconfig /all` | `ifconfig`, `networksetup -getinfo Wi-Fi` | `ip addr`, `ip route` |
| Renew the DHCP lease | `ipconfig /release` then `/renew` | `sudo ipconfig set en0 DHCP` | `sudo dhclient -r` then `dhclient`, or `nmcli` |
| Test reachability | `ping` | `ping` | `ping` |
| Show the path | `tracert` | `traceroute` | `traceroute`, `tracepath` |
| Look up a name | `nslookup` | `nslookup`, `dig` | `dig`, `nslookup` |
| Show the ARP table | `arp -a` | `arp -a` | `ip neigh` |
| Show Wi-Fi details | `netsh wlan show interfaces` | Option-click the Wi-Fi icon | `nmcli device wifi`, `iw dev` |

## Working outward

1. **Is there a link?** Cable in, or Wi-Fi associated to the right SSID.
2. **Is there a sensible address?** A `169.254.x.x` address means DHCP did not answer.
3. **Ping the default gateway.** A failure here is local: wrong mask, wrong gateway, wrong VLAN.
4. **Ping something beyond the gateway by address.** A failure here is routing, an ACL or NAT.
5. **Ping it by name.** If the address works and the name does not, the fault is DNS.

## Wireless clients

- **Wrong security settings.** A client set for WPA2 cannot join a WPA3-only network, and a wrong pre-shared key shows up as a join that never completes.
- **Weak signal.** Low signal strength or a poor signal-to-noise ratio gives slow, dropping connections even though the client is associated.
- **Wrong band.** Older clients only see 2.4 GHz.
- **Associated but no address.** The Wi-Fi works; the problem is DHCP or the VLAN behind the access point.

> In this game the PCs use the Windows command set (`ipconfig`, `ping`, `tracert`). The macOS and Linux commands are theory only.

<!-- topic: wireless -->
## Bands and channels

| Band | Non-overlapping channels | Trade-off |
| --- | --- | --- |
| 2.4 GHz | Three: **1, 6 and 11** | Longer range, crowded, slower |
| 5 GHz | Around two dozen | Shorter range, much less interference, faster |
| 6 GHz | Many more | Shortest range, newest clients only |

In 2.4 GHz each channel is about 22 MHz wide but channels are only 5 MHz apart, which is why only 1, 6 and 11 avoid each other. Neighbouring access points should use different non-overlapping channels.

## What happens to a radio signal

- **Absorption**: walls, water and people soak up the signal. Denser material absorbs more.
- **Reflection**: metal and glass bounce it, creating several copies that arrive at different times (multipath).
- **Refraction and diffraction**: the signal bends passing through or around objects.
- **Scattering**: rough surfaces break it into weaker pieces.
- **Attenuation**: it weakens with distance in any case. Higher frequencies fade faster, which is why 5 GHz reaches less far.

Signal strength is measured as **RSSI** in dBm, a negative number: -50 is strong, -80 is poor. What decides quality is the **signal-to-noise ratio**, the gap between the signal and the background noise.

## Causes of interference

- **Co-channel**: other access points on the same channel. They take turns, so everyone slows down.
- **Adjacent channel**: access points on overlapping channels, such as 1 and 3. Worse than co-channel, because the transmissions collide instead of taking turns.
- **Non-Wi-Fi sources**: microwave ovens, Bluetooth, cordless phones and baby monitors, mostly in 2.4 GHz.
- **Physical obstacles**: concrete, metal shelving, lift shafts, water tanks.

## Security protocols

| Protocol | Encryption | Status |
| --- | --- | --- |
| WEP | RC4 | Broken; never use |
| WPA | TKIP | Deprecated |
| WPA2 | AES-CCMP | Still common |
| WPA3 | AES-GCMP, with **SAE** in place of the pre-shared key handshake | Current |

**Personal** mode uses one shared passphrase. **Enterprise** mode uses 802.1X with a RADIUS server, so each user logs in with their own credentials.

## Kinds of access point

- **Standalone (autonomous)**: configured one by one. Its switch port is usually a **trunk**, because the AP maps each SSID to a VLAN itself.
- **Controller-based (lightweight)**: managed by a wireless LAN controller and tunnelled to it with **CAPWAP**. In the usual local mode its switch port is an **access port**, because user traffic travels inside the tunnel.
- **Cloud-managed**: configured from a web dashboard hosted by the vendor.

An **SSID** is the network name. One access point's coverage is a BSS; several access points sharing an SSID form an ESS, which lets clients roam.

## Controller details {v1}

The v1.1 exam also asks about the wireless LAN controller itself: its management, service and dynamic interfaces, its link aggregation group to the switch, creating a WLAN in the web interface, and AP modes such as FlexConnect, monitor and sniffer.

> Common mistakes: channels 1, 4, 8 and 11 in 2.4 GHz (they overlap); turning power up to fix coverage when the real problem is interference; a trunk port for a lightweight AP in local mode.

<!-- topic: switching -->
## Why spanning tree exists

Redundant links between switches create loops, and Ethernet frames have no hop limit, so one broadcast in a loop multiplies until the network stops. Spanning tree blocks just enough ports to leave one loop-free path, and unblocks them when a link fails. Current Cisco switches run **Rapid PVST+**: rapid spanning tree, with a separate tree for each VLAN.

## Electing the root and choosing ports

1. The switch with the lowest **bridge ID** (priority, then MAC address) becomes the **root bridge**. The default priority is 32768, so by default the oldest switch wins.
2. Every other switch picks one **root port**: its lowest-cost path to the root.
3. Each link gets one **designated port**, the end closer to the root. All ports on the root bridge are designated.
4. Any port left over is an **alternate** port (a backup path to the root) and is blocked.

Path cost by speed: 10 Mb/s is 100, 100 Mb/s is 19, 1 Gb/s is 4, 10 Gb/s is 2.

| Rapid PVST+ state | Forwards frames | Learns MAC addresses |
| --- | --- | --- |
| Discarding | No | No |
| Learning | No | Yes |
| Forwarding | Yes | Yes |

Older 802.1D spanning tree used blocking, listening, learning and forwarding and took 30 to 50 seconds to converge. Rapid spanning tree takes a second or two.

## Choosing the root on purpose

```
spanning-tree mode rapid-pvst
spanning-tree vlan 10 root primary
spanning-tree vlan 10 root secondary
spanning-tree vlan 10 priority 4096
```

`root primary` lowers the priority enough to win; `root secondary` on another switch makes it take over if the first fails. Priorities are set in steps of 4096. Check with `show spanning-tree vlan 10`: it names the root, and gives each port's role and state.

## Protecting the tree

| Feature | Where | What it does |
| --- | --- | --- |
| **PortFast** | Access ports with one end device | Skips straight to forwarding, so a PC gets its address at once |
| **BPDU Guard** | The same access ports | Shuts the port (err-disabled) if a BPDU arrives, meaning a switch was plugged in |
| **Root Guard** | Ports facing switches that must never become root | Blocks the port if a better BPDU arrives there; recovers by itself when it stops |
| **Loop Guard** | Blocked and root ports on fibre uplinks | If BPDUs stop arriving, keeps the port blocked instead of letting it forward and cause a loop |

## BPDU Filter {v1}

BPDU Filter stops a port sending or processing BPDUs. It hides spanning tree from the attached device and can create a loop if used carelessly, so BPDU Guard is the safer choice on access ports.

## EtherChannel

Several physical links bundled into one logical link: more bandwidth, and spanning tree sees one link so nothing is blocked.

| Protocol | Modes that form a channel |
| --- | --- |
| LACP (IEEE 802.3ad, open standard) | active + active, or active + passive |
| PAgP (Cisco) | desirable + desirable, or desirable + auto |
| Static | on + on |

```
interface range g0/1 - 2
 channel-group 1 mode active
interface port-channel 1
 switchport mode trunk
```

- Two passive ends (or two auto ends) never form a channel.
- Member ports must match in speed, duplex, mode and VLANs. Configure the logical `port-channel` interface afterwards, not the members.
- A **layer 3** EtherChannel is the same bundle with `no switchport` and an IP address on the port-channel interface.
- `show etherchannel summary`: `SU` beside the port-channel means layer 2 and in use; `P` beside a member means it is bundled.

## Ports for end devices

| Device | Port setup |
| --- | --- |
| PC, printer, IoT device | Access port in its VLAN, PortFast, BPDU Guard |
| IP phone with a PC behind it | Access port with two VLANs: `switchport access vlan 10` for the PC and `switchport voice vlan 20` for the phone |
| Standalone access point | Trunk, one VLAN per SSID |
| Controller-based access point | Access port; user traffic travels in the CAPWAP tunnel |
| Virtualization host | Trunk, often an EtherChannel |
| Firewall or other appliance | Trunk or routed port, depending on its design |

**Power over Ethernet** lets the switch power phones, access points and cameras over the data cable. The device asks for a power class and the switch grants it from a limited budget. `show power inline` lists what each port is supplying; `power inline never` turns it off on a port.

## Discovery protocols

- **CDP** is Cisco proprietary and on by default. `show cdp neighbors` lists directly connected Cisco devices with the local and remote port; `show cdp neighbors detail` adds the neighbour's IP address and software version.
- **LLDP** is the vendor-neutral standard (IEEE 802.1AB). Enable it with `lldp run`; read it with `show lldp neighbors`.

Both are the quickest way to check that the cabling matches the network diagram: the neighbour and ports they report are what is really connected.

> Common mistakes: leaving the root bridge to chance; PortFast on a port that leads to another switch; one EtherChannel end in passive and the other in passive; a trunk allowed list that differs between the two ends of a bundle.

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

Hosts have one default gateway. If that router fails, they are cut off. A first-hop redundancy protocol lets two or more routers share a **virtual IP and MAC address**. Hosts point at the virtual address and never notice a failover.

| | HSRP | VRRP |
| --- | --- | --- |
| Standard | Cisco | Open (IETF) |
| Roles | Active and standby | Master and backup |
| Default priority | 100, highest wins | 100, highest wins |
| Preemption (a better router takes over when it returns) | Off by default | On by default |
| Virtual IP | A separate address | Can be a router's own interface address |

## Reading their status

`show standby brief` (HSRP) and `show vrrp brief` (VRRP) give one line per group:

```
Interface   Grp  Pri P State   Active          Standby         Virtual IP
Gi0/0       1    110 P Active  local           192.168.1.3     192.168.1.1
```

Read it as: on G0/0, group 1, this router has priority 110 with preemption (`P`), it is the **Active** router, the standby is 192.168.1.3, and hosts should use 192.168.1.1 as their gateway. Two routers both showing Active for the same group cannot hear each other's hellos: look for a layer 2 problem between them.

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

## Host routes

A route to one single address uses the mask 255.255.255.255 (a /32):

```
ip route 10.2.0.50 255.255.255.255 10.0.13.2
```

Because the longest match wins, a host route overrides whatever route covers the rest of that subnet. It is used to send one server's traffic a different way. IPv6 has the same four kinds of static route; they are on the IPv6 page.

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

The goal state is **FULL**.

## Broadcast and point-to-point links

OSPF treats an Ethernet link as a **broadcast** network, where many routers could be present. To avoid every router pairing with every other, they elect a **designated router** (DR) and a backup (BDR): the highest interface priority wins, then the highest router ID. Priority 0 means "never". The others show as DROTHER and only become FULL with the DR and BDR.

On a link with exactly two routers the election is wasted effort. Setting both ends to point-to-point skips it:

```
interface g0/1
 ip ospf network point-to-point
```

Both ends must use the same network type. In `show ip ospf neighbor` a point-to-point neighbour shows `FULL/ -` instead of `FULL/DR`.

## OSPFv3 for IPv6 {v2}

OSPFv3 is the same protocol carrying IPv6 routes. What stays: areas, cost, the neighbour rules, DR election and a **32-bit router ID** written like an IPv4 address. What changes:

- It is enabled **on the interface**, not with `network` statements.
- Neighbours use their **link-local** addresses as next hops.
- If the router has no IPv4 address at all, the router ID must be set by hand.

```
ipv6 unicast-routing
ipv6 router ospf 1
 router-id 1.1.1.1
interface g0/0
 ipv6 ospf 1 area 0
```

Check with `show ipv6 ospf neighbor` and `show ipv6 route ospf`.

## Check your work

| Command | Use it to see |
| --- | --- |
| `show ip ospf neighbor` | Who you are adjacent to and in what state. Empty means one of the six conditions fails |
| `show ip protocols` | Router ID, networks advertised, passive interfaces |
| `show ip ospf interface brief` | Which interfaces run OSPF, their area and cost |
| `show ip route` | `O` routes learned from neighbours |

> Common mistakes: an interface missing from the `network` statements; one end in a different area; making the link to a neighbour passive instead of the LAN; a wrong wildcard mask.

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

The router forwards the request as a unicast to that server and relays the answer back. When relay fails, check three things: the helper address is on the interface facing the **clients**, the router can reach the server, and the server has a pool for the clients' subnet with a route back to it.

## A router as a DHCP client

A router interface can take its own address from DHCP, which is common on a link to an ISP:

```
interface g0/1
 ip address dhcp
 no shutdown
```

`show ip interface brief` then lists the address with the method `DHCP`, and the router installs a default route from the gateway it was given.

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

<!-- topic: services -->
## DNS: names to addresses

Hosts are reached by name, and DNS turns the name into an address. Each kind of answer is a record type:

| Record | Maps | Example use |
| --- | --- | --- |
| **A** | A name to an IPv4 address | `www.example.com` to 203.0.113.10 |
| **AAAA** | A name to an IPv6 address | The same site over IPv6 |
| **CNAME** | A name to another name (an alias) | `shop.example.com` points at `www.example.com` |
| **MX** | A domain to its mail servers, with a priority | Where to deliver mail for `@example.com` |
| **NS** | A domain to its authoritative name servers | Who answers for `example.com` |
| **PTR** | An address back to a name (reverse lookup) | Used by mail servers and logs |

DNS uses UDP port 53, and TCP 53 for large answers.

## Diagnosing a name problem

1. **Ping the address.** If that works and the name does not, the network is fine and DNS is at fault.
2. **Ask DNS directly**: `nslookup www.example.com` (or `dig`). It shows which server answered and what it said.
3. Read the answer:

| What you see | Likely cause |
| --- | --- |
| The server does not respond | Wrong DNS server on the host, or it is unreachable |
| "Non-existent domain" | The record is missing or the name is mistyped |
| Web works by address but not by name | Missing or wrong A, AAAA or CNAME record |
| Mail to the domain bounces | Missing or wrong MX record, or the MX name has no A record |
| Mail is rejected as suspicious | No PTR record for the sending server |
| One site resolves, the whole domain does not | NS records point at the wrong servers |

On a router, `ip name-server 8.8.8.8` sets its DNS server, and `no ip domain-lookup` stops it treating a mistyped command as a name to resolve.

## Secure file transfer {v2}

Device images and configurations should be copied over an encrypted session. Both secure options run inside SSH on TCP 22:

| | SCP | SFTP |
| --- | --- | --- |
| What it is | Simple copy over SSH | A fuller file protocol over SSH: list, rename, delete, resume |
| On IOS | The device can be the server or the client | The device is a client |

```
ip scp server enable
copy running-config scp://admin@10.0.99.50/hq-r1.cfg
copy scp://admin@10.0.99.50/image.bin flash:
```

SCP needs SSH working first and an account with privilege 15. After copying an image, `verify /md5 flash:image.bin` confirms it arrived intact.

## FTP and TFTP {v1}

- **TFTP** (UDP 69): no login and no encryption. Simple, and still used in labs and for recovery.
- **FTP** (TCP 20 and 21): has a login, but sends it and the data in clear text.

## NTP: keeping time {v1}

NTP (UDP 123) keeps device clocks in step, so that log messages from different devices can be put in order. **Stratum** counts hops from the reference clock: a device synchronised to a stratum 2 server is stratum 3. `ntp server 10.0.0.1` makes a device a client; `ntp master` makes it a source for others; `show ntp status` reports whether it is synchronised.

## Quality of service {v1}

When a link is congested, QoS decides what waits and what is dropped.

- **Classification and marking**: identify traffic and label it. **DSCP** is six bits in the IP header and survives across routers. **CoS** is three bits in the 802.1Q tag, so it exists only on trunks.
- **Queuing**: voice goes in a priority queue so it is sent first.
- **Policing** drops or re-marks traffic above a rate. **Shaping** buffers it and sends it later, smoothing bursts.
- Voice needs low delay, low jitter and low loss more than it needs bandwidth.

> Syslog and SNMP have their own page. Common mistakes: blaming the network when only name resolution fails; a CNAME pointing at a name that has no A record; copying device files with TFTP across an untrusted network.

<!-- topic: monitoring -->
## Syslog: reading a message

Every IOS device describes what happens to it in log messages. They all follow one format:

```
*Mar  1 09:41:07.123: %LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to up
```

| Part | Example | Meaning |
| --- | --- | --- |
| Timestamp | `*Mar 1 09:41:07.123` | When. A leading `*` means the clock is not synchronised |
| Facility | `LINK` | Which part of the system is reporting: LINK, LINEPROTO, OSPF, SYS, SEC |
| Severity | `3` | How serious, from 0 to 7 |
| Mnemonic | `UPDOWN` | A short code for the event |
| Description | `Interface ... changed state to up` | The detail |

You see these in the labs every time an interface or an OSPF neighbour changes.

## Severity levels

| Level | Name | Example |
| --- | --- | --- |
| 0 | Emergency | The system is unusable |
| 1 | Alert | Act immediately |
| 2 | Critical | Hardware failure |
| 3 | Error | An interface went down |
| 4 | Warning | A configuration problem |
| 5 | Notice | A neighbour came up; an interface was shut down by an administrator |
| 6 | Informational | An ACL logged a packet |
| 7 | Debugging | Debug output |

Lower numbers are more serious. A mnemonic: "Every Awesome Cisco Engineer Will Need Ice cream Daily". Choosing a level logs that level **and everything more severe**: `logging trap 4` sends levels 0 to 4.

## Where messages go

| Destination | Command | Default |
| --- | --- | --- |
| Console | `logging console` | On, all levels |
| Remote sessions | `terminal monitor` in the SSH session | Off |
| Memory buffer | `logging buffered`, read with `show logging` | Varies |
| Syslog server | `logging host 10.0.0.50` and `logging trap <level>` | Off; UDP 514 |

`service timestamps log datetime msec` adds proper timestamps. Accurate time across devices needs NTP.

Syslog servers also sort messages by a **facility code** in the protocol itself. Cisco devices send as **local7** unless `logging facility` changes it; local0 to local7 are the codes left free for network equipment.

## SNMP: asking devices for numbers

Syslog is the device telling you things. SNMP is a management station asking, on a schedule.

- A **manager** (the monitoring system) polls an **agent** on each device.
- The agent exposes values in a **MIB**, a tree of variables; each one is addressed by an **OID**.
- **Get** reads a value, **Set** changes one, and a **Trap** or **Inform** is the agent speaking first when something happens. An Inform is acknowledged; a Trap is not.
- The agent listens on UDP 161; traps go to the manager on UDP 162.

| Version | Security |
| --- | --- |
| SNMPv1, v2c | A community string sent in clear text |
| SNMPv3 | Usernames, authentication and encryption |

SNMP is what draws interface graphs and raises "CPU high" alarms.

> Common mistakes: reading severity the wrong way round (0 is worst); expecting log messages in an SSH session without `terminal monitor`; using SNMPv2c across an untrusted network.

<!-- topic: security -->
## AAA

- **Authentication**: who are you?
- **Authorization**: what are you allowed to do?
- **Accounting**: what did you do?

A device can check logins against its own **local usernames**, or act as a **client** of a central AAA server so that accounts are managed in one place.

| | TACACS+ | RADIUS |
| --- | --- | --- |
| Transport | TCP 49 | UDP 1812 (authentication) and 1813 (accounting) |
| Encrypts | The whole payload | Only the password |
| Separates the three As | Yes, so each command can be authorized | Authentication and authorization are combined |
| Typical use | Administering network devices | Network access: Wi-Fi, VPN, 802.1X |

## Making a device an AAA client

```
username admin secret Str0ngPass
aaa new-model
tacacs server CORP
 address ipv4 10.0.99.20
 key Sh4redKey
aaa authentication login default group tacacs+ local
```

- `aaa new-model` switches the device to AAA. From then on the method list decides how logins are checked.
- The method list is tried in order: here the TACACS+ servers first, then the **local** usernames if no server answers. Always end with `local`, and keep a local account, or a server outage locks you out.
- A RADIUS server is defined the same way with `radius server NAME` and `group radius`.

## Passwords on IOS

- `enable secret` is stored as a hash and wins if both it and `enable password` are set.
- `service password-encryption` only obscures clear-text passwords with weak type 7 encoding. It stops shoulder-surfing, nothing more.
- `username NAME secret PASSWORD` creates a local account with a hashed password.

## Layer 2 attacks and their defences

| Attack | What happens | Defence |
| --- | --- | --- |
| Rogue DHCP server | Hands out a bad gateway to sit in the path | DHCP snooping |
| ARP spoofing | Claims the gateway's IP address with its own MAC | Dynamic ARP inspection |
| MAC flooding | Fills the switch table so frames are flooded | Port security |
| Unknown device plugged in | Unauthorised access | Port security, shutting unused ports, 802.1X |
| Broadcast storm | A loop or faulty device floods the VLAN | Storm control |
| Rogue IPv6 router | Announces itself as the IPv6 gateway | RA guard |

## DHCP snooping and dynamic ARP inspection

```
ip dhcp snooping
ip dhcp snooping vlan 10
interface g0/1
 ip dhcp snooping trust
ip arp inspection vlan 10
interface g0/1
 ip arp inspection trust
```

- **DHCP snooping** sorts ports into trusted and untrusted. Server messages (offers and acknowledgements) are accepted only on **trusted** ports, the uplinks toward the real server. Every port is untrusted until you say otherwise. The switch also records which address was leased to which port in a **binding table**.
- **Dynamic ARP inspection** checks ARP messages on untrusted ports against that binding table and drops the ones that do not match. It depends on DHCP snooping being enabled first.

## Storm control {v2}

Storm control measures broadcast, multicast or unknown unicast traffic arriving on a port and acts when it passes a threshold:

```
interface fa0/1
 storm-control broadcast level 5.00
 storm-control action shutdown
```

`level` is a percentage of the port's bandwidth. Above it the excess traffic is dropped; `action shutdown` err-disables the port instead, and `action trap` sends an SNMP trap. `show storm-control` shows the thresholds and current levels.

## RA guard {v2}

In IPv6, hosts learn their gateway from **router advertisements**. Any device that sends one can make itself the gateway for the VLAN. RA guard drops router advertisements arriving on ports where no router should be:

```
interface fa0/1
 ipv6 nd raguard
```

It is the IPv6 counterpart of DHCP snooping: only the ports facing real routers are allowed to announce one.

## Threats and people {v1}

- A **vulnerability** is a weakness, an **exploit** is a way to use it, a **threat** is someone or something that might, and **mitigation** reduces the risk.
- **Social engineering** attacks people: phishing (email), spear phishing (targeted), tailgating (following someone through a door).
- A security programme combines user awareness, training and physical access control.
- Multi-factor authentication needs at least two of: something you know, something you have, something you are.

## Firewalls {v1}

A router ACL filters packets by address and port and keeps no memory of connections. A **stateful firewall** tracks connections and allows return traffic automatically. An **IPS** inspects traffic for known attack patterns and can block it.

> Common mistakes: a method list without `local` at the end; forgetting to trust the uplink for DHCP snooping, which blocks the real server; enabling dynamic ARP inspection without DHCP snooping.

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

<!-- topic: vpn -->
## What a VPN is for

A VPN carries private traffic across a network you do not trust, usually the Internet, as if the two ends were directly connected. It replaces expensive private circuits between sites and lets staff work from anywhere.

## The two kinds

| | Site-to-site | Remote access |
| --- | --- | --- |
| Connects | Two networks, router to router or firewall to firewall | One user's device to the company network |
| Who knows about it | Only the gateways; hosts are unaware | The user runs VPN client software |
| Always on | Usually | Started when needed |
| Typical technology | IPsec, often with GRE inside it | TLS or IPsec with a client such as Cisco Secure Client |

## What IPsec provides

IPsec is a framework, not one protocol. It gives four protections:

- **Confidentiality**: encryption, normally AES.
- **Integrity**: a hash (SHA) proves the packet was not altered.
- **Authentication**: each end proves who it is, with a pre-shared key or certificates.
- **Anti-replay**: sequence numbers stop a captured packet being sent again.

## The protocols inside it

| Protocol | Job |
| --- | --- |
| **IKE** (UDP 500, or UDP 4500 through NAT) | Negotiates the tunnel and exchanges keys |
| **ESP** (IP protocol 50) | Encrypts and authenticates the data. The one that is used |
| **AH** (IP protocol 51) | Authenticates only, no encryption. Rare, and breaks through NAT |

IKE runs first to build a secure channel and agree keys (a security association), then ESP carries the traffic.

## Transport and tunnel mode

- **Tunnel mode** encrypts the whole original packet and adds a new IP header. Used between gateways, so it is the mode for site-to-site VPNs.
- **Transport mode** keeps the original IP header and protects only the payload. Used host to host, or to protect a GRE tunnel.

IPsec alone carries only unicast IP. To send multicast, such as OSPF hellos, across a VPN, the traffic is first wrapped in **GRE** and the GRE tunnel is then protected by IPsec.

## Remote access choices

- **Full tunnel**: all of the user's traffic goes through the company. Safer, slower.
- **Split tunnel**: only company traffic uses the VPN; the rest goes straight to the Internet.

> The exam asks you to describe these, not configure them. Common mistakes: thinking AH encrypts; mixing up the modes (tunnel mode is the one with the new IP header); forgetting that IPsec by itself cannot carry routing protocol multicast.

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

<!-- topic: netops -->
## Ways to manage a network

| Approach | How changes are made | Good for | Weakness |
| --- | --- | --- | --- |
| **Device-based** | Log in to each device and type, or use its web page | Small networks, emergencies | Slow, inconsistent, no record of intent |
| **Controller-based** | A controller on your premises (such as Catalyst Center) holds the intent and configures the devices | Large campuses | The controller must be bought and run |
| **Cloud-based** | A dashboard hosted by the vendor (such as Meraki) manages devices that call home | Many small sites, small teams | Depends on Internet access and a subscription |
| **Automation-based** | Scripts and tools such as Ansible push changes to many devices | Repeatable changes on existing equipment | Someone must write and maintain the automation |
| **Infrastructure as code** | The intended configuration lives in files in version control; a tool makes reality match | Review, history and rollback of every change | Needs discipline and tooling |

These combine. A common pattern is infrastructure as code, with Ansible as the tool that applies it.

## Ansible in five words

- **Control node**: the machine Ansible runs on. Nothing is installed on the network devices: Ansible is **agentless** and connects with SSH.
- **Inventory**: the list of devices, arranged in groups.
- **Playbook**: a YAML file describing what should be true.
- **Task**: one step in a playbook, which calls a **module**.
- **Module**: the code that does the work, such as `ios_config` for configuration lines or `ios_command` for show commands.

## An inventory

```
[access]
SW1 ansible_host=10.0.99.11
SW2 ansible_host=10.0.99.12
```

`[access]` is a group. A playbook can target a group, one host, or `all`.

## A playbook

```
- name: Roll out the CCTV VLAN
  hosts: access
  tasks:
    - name: Create VLAN 40
      ios_config:
        parents: vlan 40
        lines:
          - name CCTV
```

Read it top down: one **play** that runs on every host in the `access` group, with one task. `parents` is the mode to enter first, and `lines` are the commands to make sure are present there. Indentation is the structure: YAML has no brackets, so a line indented wrongly means something different.

## Running it

| Command | What it does |
| --- | --- |
| `ansible all -m ping` | Checks Ansible can log in to every host |
| `ansible access -m ios_command -a "show vlan brief"` | Runs one show command on a group |
| `ansible-playbook -i inventory.ini cctv.yml` | Runs a playbook |
| `ansible-playbook cctv.yml --check` | Reports what would change, without changing it |

## Reading the result

Each host ends each task in one state:

- **ok**: already as described; nothing was done.
- **changed**: Ansible made a change.
- **failed**: the device rejected something.
- **unreachable**: Ansible could not log in.

Running the same playbook twice should report `changed` the first time and `ok` the second. That property is **idempotence**, and it is what makes a playbook safe to run again.

> One lab in this game lets you fix an inventory and a playbook and run them against simulated switches. Common mistakes: a host missing from the inventory, so it is silently skipped; a group name in `hosts:` that does not exist; bad indentation.

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

## Three more tools

**The log.** `show logging` lists recent messages held in memory. Look for interfaces going down, neighbours dropping and ports being err-disabled around the time the problem started.

**Extended ping.** Typing `ping` alone on a router asks questions instead of pinging at once. The useful ones are the **source** address or interface (to test from the LAN side rather than the WAN side), the packet size, the repeat count and the don't-fragment bit. A ping that works from the router's WAN address but fails when sourced from its LAN interface means the far end has no route back to that LAN, or NAT is not translating it.

**A packet capture.** Each line of a capture is one frame:

```
No. Source          Destination     Protocol Info
1   192.168.1.10    10.0.0.10       TCP      51514 > 80 [SYN]
2   192.168.1.10    10.0.0.10       TCP      51514 > 80 [SYN]  (retransmission)
```

Read it for who is talking, with which protocol and port, and whether there is an answer. A SYN repeated with no SYN-ACK means the request left and nothing came back: a filter, a missing return route, or nothing listening. A SYN answered by a reset (RST) means the host is reachable but the port is closed. ARP requests with no reply mean the target is not on that VLAN.

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
