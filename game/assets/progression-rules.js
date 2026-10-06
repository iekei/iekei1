'use strict';

(function (global) {
  function normalizeNodes(nodes, country) {
    const source = Array.isArray(nodes) ? nodes : [];
    const parent = new Map(source.map(node => [node.id, node.id]));
    const find = id => {
      const current = parent.get(id);
      if (current === undefined) return null;
      if (current === id) return id;
      const root = find(current);
      parent.set(id, root);
      return root;
    };
    const union = (left, right) => {
      if (!parent.has(left) || !parent.has(right)) return;
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    };

    source.forEach(node => {
      (node.mutually_exclusive || []).forEach(id => union(node.id, id));
    });

    const explicitGroups = new Map();
    source.forEach(node => {
      if (!node.exclusive_group) return;
      if (!explicitGroups.has(node.exclusive_group)) explicitGroups.set(node.exclusive_group, []);
      explicitGroups.get(node.exclusive_group).push(node.id);
    });
    explicitGroups.forEach(ids => ids.slice(1).forEach(id => union(ids[0], id)));

    const components = new Map();
    source.forEach(node => {
      const root = find(node.id);
      if (!components.has(root)) components.set(root, []);
      components.get(root).push(node.id);
    });
    const groupById = new Map();
    components.forEach(ids => {
      if (ids.length < 2) return;
      const groupId = `${country}:${ids.slice().sort().join('|')}`;
      ids.forEach(id => groupById.set(id, groupId));
    });

    return source.map(node => {
      const locKey = node.loc_key || node.id;
      return {
        ...node,
        country: node.country || country,
        loc_key: locKey,
        desc_key: node.desc_key || `${locKey}_desc`,
        prerequisites: node.prerequisites || [],
        mutually_exclusive: node.mutually_exclusive || [],
        exclusive_group: node.exclusive_group || groupById.get(node.id) || null,
        cost: node.cost ?? node.days ?? node.research_time ?? 70
      };
    });
  }

  function lockOwner(node, branchChoices) {
    if (!node?.exclusive_group) return null;
    const chosenId = branchChoices?.[node.exclusive_group];
    return chosenId && chosenId !== node.id ? chosenId : null;
  }

  global.ProgressionRules = { normalizeNodes, lockOwner };
})(window);
