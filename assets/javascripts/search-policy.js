/* Build conservative related queries to merge after exact passage matches. */
(() => {
  const aliasGroups = [
    ["消息鉴别码", "消息认证码", "MAC"],
    ["杂凑", "哈希", "Hash"]
  ];
  const protectedAlgorithms = new Set([
    "aes", "des", "tdes", "sm1", "sm2", "sm3", "sm4", "sm9", "ssf33", "zuc",
    "rsa", "dsa", "ecdsa", "ecdh", "eddsa", "blake", "sha", "hmac",
    "ecb", "cbc", "cfb", "ofb", "ctr", "gcm", "ccm"
  ]);

  self.wikiSearchFallbacks = query => {
    if (typeof query !== "string" || query.length > 128) return [];
    const value = query.trim();
    if (!value) return [];

    const normalized = value.toLowerCase();
    const candidates = [];
    for (const aliases of aliasGroups) {
      if (!aliases.some(alias => alias.toLowerCase() === normalized)) continue;
      for (const alias of aliases) {
        if (alias.toLowerCase() !== normalized) {
          candidates.push({ mode: "alias", query: `"${alias}"`, term: alias });
        }
      }
    }

    // Numbers, identifiers, Chinese text and explicit query operators must not
    // be changed accidentally while tolerating an English spelling mistake.
    if (!/^[a-z]+(?:\s+[a-z]+)*$/i.test(value)) return candidates;
    const tokens = value.split(/\s+/);
    if (tokens.length > 6) return candidates;
    const eligible = tokens.map(token =>
      token.length >= 5 && token.length <= 40 &&
      !/^[a-f]+$/i.test(token) &&
      !protectedAlgorithms.has(token.toLowerCase()) &&
      !(token.length <= 6 && /^[A-Z]+$/.test(token))
    );
    if (eligible.some(Boolean)) {
      candidates.push({
        mode: "fuzzy",
        query: tokens.map((token, index) => `+${token}${eligible[index] ? "~1" : ""}`).join(" ")
      });
    }
    return candidates;
  };
})();
