// Copyright (C) 2026 Alexandre Demartin
//
// savepoint() names each savepoint pgcast_savepoint_<n>, from a counter of the process (#723): the tests that
// freeze its SQL read the names in the order they are sent.

/** Each savepoint's name, `pgcast_savepoint_<n>`, written `sp1`, `sp2`… in the order it is first sent. */
export const renamed = (texts: string[]) => {
  const names = new Map<string, string>();
  const rename = (name: string) => {
    if (!names.has(name)) names.set(name, `sp${names.size + 1}`);
    return names.get(name) as string;
  };
  return texts.map(text => text.replace(/\bpgcast_savepoint_\d+\b/g, rename));
};
