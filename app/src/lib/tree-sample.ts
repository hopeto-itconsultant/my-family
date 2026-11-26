// Fictional family used by the dev preview and the layout tests.
// These are not the relatives in the directory.

import type { FamilyRelation } from '@/lib/types';
import type { TreePerson } from '@/lib/tree-layout';

const person = (
  id: string,
  name: string,
  branch: string | null,
  nicknames: string[] = [],
): TreePerson => ({ id, name, branch, nicknames, deceased: false });

export const SAMPLE_PEOPLE: TreePerson[] = [
  person('arun', 'Arun Mehta', 'Mehta'),
  person('bina', 'Bina Mehta', 'Mehta', ['Binu']),
  person('chitra', 'Chitra Rao', 'Mehta'),
  person('deepak', 'Deepak Rao', 'Rao'),
  person('esha', 'Esha Sen', 'Mehta'),
  person('farid', 'Farid Rao', 'Rao'),
  person('gita', 'Gita Kapoor', 'Rao'),
  person('ishan', 'Ishan Kapoor', 'Kapoor'),
  person('jaya', 'Jaya Kapoor', 'Kapoor'),
  person('hari', 'Hari Sen', 'Mehta'),
  person('kiran', 'Kiran Das', 'Das'),
  person('lalita', 'Lalita Das', 'Das'),
  person('manoj', 'Manoj Das', 'Das'),
  person('nila', 'Nila Iyer', null, ['Nilu']),
  person('om', 'Om Iyer', null),
  person('pooja', 'Pooja Iyer', null),
];

const edge = (
  id: string,
  from_member: string,
  to_member: string,
  kind: FamilyRelation['kind'],
): FamilyRelation => ({ id, from_member, to_member, kind });

export const SAMPLE_RELATIONS: FamilyRelation[] = [
  edge('s-arun-bina', 'arun', 'bina', 'spouse'),
  edge('p-chitra-arun', 'chitra', 'arun', 'parent'),
  edge('p-chitra-bina', 'chitra', 'bina', 'parent'),
  edge('p-esha-arun', 'esha', 'arun', 'parent'),
  edge('p-esha-bina', 'esha', 'bina', 'parent'),
  edge('sib-chitra-esha', 'chitra', 'esha', 'sibling'),
  edge('s-chitra-deepak', 'chitra', 'deepak', 'spouse'),
  edge('p-farid-chitra', 'farid', 'chitra', 'parent'),
  edge('p-farid-deepak', 'farid', 'deepak', 'parent'),
  edge('p-gita-chitra', 'gita', 'chitra', 'parent'),
  edge('p-gita-deepak', 'gita', 'deepak', 'parent'),
  edge('sib-farid-gita', 'farid', 'gita', 'sibling'),
  edge('s-gita-ishan', 'gita', 'ishan', 'spouse'),
  edge('p-jaya-gita', 'jaya', 'gita', 'parent'),
  edge('p-jaya-ishan', 'jaya', 'ishan', 'parent'),
  edge('p-hari-esha', 'hari', 'esha', 'parent'),
  edge('s-kiran-lalita', 'kiran', 'lalita', 'spouse'),
  edge('p-manoj-kiran', 'manoj', 'kiran', 'parent'),
  edge('p-manoj-lalita', 'manoj', 'lalita', 'parent'),
];
