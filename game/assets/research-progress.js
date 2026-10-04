/** Translate legacy country-specific IDs when restoring the shared research tree. */
const ResearchProgress = {
  restore(saved, techData, slotCount = 5) {
    const techs = Object.values(techData).flat();
    const byId = new Map(techs.map(tech => [tech.id, tech]));
    const aliases = new Map(techs.flatMap(tech => (tech.legacy_ids || []).map(id => [id, tech.id])));
    const resolveId = id => byId.has(id) ? id : aliases.get(id);
    const completed = new Set();
    const complete = id => {
      if (!id || completed.has(id) || !byId.has(id)) return;
      completed.add(id);
      (byId.get(id).prerequisites || []).forEach(complete);
    };
    for (const oldId of saved?.researched || []) {
      const id = resolveId(oldId);
      // Migration grants the prerequisite chain so the replacement is usable.
      if (id !== oldId) complete(id);
      else if (id) completed.add(id);
    }
    const researching = {};
    const activeIds = new Set();
    for (const [slot, entry] of Object.entries(saved?.researching || {})) {
      if (!entry || !Number.isInteger(Number(slot)) || Number(slot) < 1 || Number(slot) > slotCount) continue;
      const id = resolveId(entry.techId);
      if (!id || completed.has(id) || activeIds.has(id)) continue;
      const tech = byId.get(id);
      if (id !== entry.techId) (tech.prerequisites || []).forEach(complete);
      const total = Math.max(1, tech.research_time || 100);
      const ratio = Number.isFinite(entry.progress) && Number.isFinite(entry.total) && entry.total > 0 ? entry.progress / entry.total : 0;
      researching[slot] = { techId: id, total, progress: Math.min(total - 1, Math.max(0, Math.floor(total * ratio))) };
      activeIds.add(id);
    }
    // A migrated later technology can complete a prerequisite in another slot.
    for (const [slot, entry] of Object.entries(researching)) if (completed.has(entry.techId)) delete researching[slot];
    return { researched: [...completed], researching };
  }
};
if (typeof module !== 'undefined') module.exports = ResearchProgress;
if (typeof window !== 'undefined') window.ResearchProgress = ResearchProgress;
