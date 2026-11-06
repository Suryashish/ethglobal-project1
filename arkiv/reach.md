# Reach — who uses it and how it spreads

**Who**: journalists, whistleblowers, activists and anyone at risk who needs "if something happens to me, this comes out" — plus ordinary
social users who want time-capsule posts ("opens in 5 days", "only readers from 🇮🇳 India").

**How it spreads**
1. **Every sealed post is an ad.** A sealed line on X / Reddit (`🔒 Sealed by a verified human · opens … · <site>/s/<id>`) is seen by every
   follower. Followers without the extension click the link and land on the public reader page — a live countdown that reads straight
   from Arkiv. When it opens, they come back to read it.
2. **The extension turns feeds into Arkiv readers.** Each extension user's feed silently queries Arkiv for every sealed post it shows —
   reads scale with audience size, not with authors.
3. **Deterrence is public by design.** A journalist announces "my files are sealed; if I go silent they open" and links the reader page.
   The switch only works because people can see it — so being seen is the product.
4. **Newsrooms and NGOs** (press-freedom groups, legal-aid orgs) can arm seals for their at-risk reporters and run their own mirror.

**What we measure** (all derivable from Arkiv, no analytics server): number of `iigs.seal` entities armed, live `iigs.checkin`
heartbeats, `iigs.release` entities (posts that opened), and reader-page/extension reads.
