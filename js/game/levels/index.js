import tier1 from "./tier1.js";
import tier2 from "./tier2.js";
import tier3 from "./tier3.js";
import tier4 from "./tier4.js";
import tier5 from "./tier5.js";

export const TIERS = [
  { id: 1, name: "Orientation Week", rank: "Intern", blurb: "Find your way around the console, lock a device down and get a LAN talking." },
  { id: 2, name: "Access Layer", rank: "Junior Engineer", blurb: "VLANs, trunks, inter-VLAN routing and port security." },
  { id: 3, name: "Routing Rotation", rank: "Network Engineer", blurb: "Static routes, default routes and OSPF, then fixing someone else's OSPF." },
  { id: 4, name: "Services and Security", rank: "Senior Engineer", blurb: "DHCP, NAT, access lists and hardened remote access." },
  { id: 5, name: "Incident Lead", rank: "Lead Engineer", blurb: "A multi-fault outage and a full branch build, with no step-by-step." },
];

export const LEVELS = [...tier1, ...tier2, ...tier3, ...tier4, ...tier5];
export const LEVEL_BY_ID = new Map(LEVELS.map(l => [l.id, l]));
