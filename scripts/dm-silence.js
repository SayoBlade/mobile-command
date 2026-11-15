/**
 * THE DM'S MACHINE STAYS QUIET: which of his own channels to zero, and which to give back (pure; no Foundry).
 *
 * Music since 2026-10-09 (`dmSilentMusic`). ENVIRONMENT added 2026-11-16 (`dmSilentEnvironment`), because Syrinscape
 * plays on Foundry's Environment channel whatever its playlist says (the module's issue #37), so with the TV connected
 * every Syrinscape mood played twice out of the one PC (deck-command SYRINSCAPE-SHARE-2026-11-15, SOUND-PLAN-2026-11-16
 * §8). Claim-and-release per channel: only a channel WE zeroed is restored, to Foundry's 0.5, since no level was recorded.
 *
 * @param {object} s
 * @param {boolean} s.tvActive  the shared-screen account is CONNECTED (not merely configured)
 * @param {{music:boolean, environment:boolean}} s.want   the two world settings
 * @param {{music:number, environment:number}} s.level   this client's current core volumes
 * @param {{music:boolean, environment:boolean}} s.claimed  did we zero it (client flags)
 * @returns {Array<{channel:string, key:string, flag:string, set?:number, claim:boolean}>}  writes to make, in order
 */
export const DM_SILENCE_CHANNELS = [
  { channel: "music", key: "globalPlaylistVolume", flag: "dmAudioSilenced" },
  { channel: "environment", key: "globalAmbientVolume", flag: "dmEnvSilenced" },
];

export function planDmSilence({ tvActive, want, level, claimed }) {
  const out = [];
  for (const c of DM_SILENCE_CHANNELS) {
    const on = Boolean(tvActive && want?.[c.channel]);
    if (on) {
      if (Number(level?.[c.channel]) !== 0) out.push({ ...c, set: 0, claim: true });
    } else if (claimed?.[c.channel]) {
      // his own zero (he slid it down himself after we gave it back) is never touched: only OUR zero comes back
      out.push(Number(level?.[c.channel]) === 0 ? { ...c, set: 0.5, claim: false } : { ...c, claim: false });
    }
  }
  return out;
}
