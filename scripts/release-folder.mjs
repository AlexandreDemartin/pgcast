// Print the folder whose package manifest matches the release tag.
import {existsSync, readdirSync, readFileSync} from 'node:fs';

const tag = process.argv[2];
const packages = ['adapters', 'tools'].flatMap(dir => readdirSync(dir).map(name => `${dir}/${name}`));
for (const folder of ['.', ...packages]) {
  const manifest = `${folder}/package.json`;
  if (!existsSync(manifest)) continue;
  const {name, version} = JSON.parse(readFileSync(manifest, 'utf8'));
  if (tag === (folder === '.' ? `v${version}` : `${name}@${version}`)) {
    console.log(folder);
    process.exit(0);
  }
}
console.error(`No package matches tag ${tag}`);
process.exit(1);
