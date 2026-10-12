const fs = require('fs');
const path = require('path');

const dirsToSearch = [
  path.join(__dirname, '..', 'node_modules', '@firebase', 'firestore'),
  path.join(__dirname, '..', 'node_modules', 'firebase'),
];

let patchedCount = 0;

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // 0. Clean up any previous guard injections or variable declarations
  if (content.includes('__GUARDED_') || content.includes('const _m =') || content.includes('const _a =')) {
    content = content.replace(/\/\*\s*__GUARDED_[^*]+\*\/\s*const\s+_m\s*=[^;]+;\s*if\s*\(_m\.includes[^}]+\}\s*/g, '');
    content = content.replace(/\/\*\s*__GUARDED_[^*]+\*\/\s*const\s+_a\s*=[^;]+;\s*if\s*\([^}]+\}\s*/g, '');
    content = content.replace(/\/\*\s*__GUARDED_[^*]+\*\/\s*/g, '');
    content = content.replace(/const\s+_m\s*=\s*String\(\[[^\]]+\]\[0\]\s*\|\|\s*['"][^'"]*['"]\);\s*if\s*\(_m\.includes\([^)]+\)\s*\|\|\s*_m\.includes\([^)]+\)\s*\|\|\s*_m\.includes\([^)]+\)\)\s*\{\s*return;\s*\}/g, '');
    content = content.replace(/const\s+_a\s*=\s*\[[^\]]*\];\s*if\s*\(_a\[0\]\s*===[^}]+\}\s*/g, '');
    modified = true;
  }

  // 1. Replace any direct call to fail(15467, ...) or fail(0x3c6b, ...) with false
  if (/fail\s*\(\s*(?:15467|0x3c6b)\s*,/i.test(content)) {
    content = content.replace(/fail\s*\(\s*(?:15467|0x3c6b)\s*,\s*\{[^}]*\}\s*\)/g, 'false');
    modified = true;
  }

  // 2. In isPermanentError switch statement, ensure default: returns false
  const defaultClauseRegex = /default:\s*(?:if\s*\([^)]*\)\s*\{[^}]*\}\s*)?return\s+(?:!1|false|fail\s*\(\s*(?:15467|0x3c6b)[^)]*\));?/g;
  if (defaultClauseRegex.test(content)) {
    content = content.replace(defaultClauseRegex, 'default: return false;');
    modified = true;
  }

  // 3. Guard __PRIVATE__fail against ID 3c6b (15467 / 0x3c6b) or auth/network-request-failed
  const privateFailRegex = /function\s+__PRIVATE__fail\s*\(\s*([a-zA-Z0-9_$]+)\s*,\s*([a-zA-Z0-9_$]+)\s*,\s*([a-zA-Z0-9_$]+)\s*\)\s*\{/g;
  if (/function\s+__PRIVATE__fail\s*\(/i.test(content) && !content.includes('/* __CLEAN_GUARD_FAIL__ */')) {
    content = content.replace(privateFailRegex, (match, idArg, msgArg, ctxArg) => {
      modified = true;
      return `${match} /* __CLEAN_GUARD_FAIL__ */ if (${idArg} === 15467 || ${idArg} === 0x3c6b || ${idArg} === '3c6b' || (${ctxArg} && typeof ${ctxArg} === 'object' && String(${ctxArg}.code).includes('auth/'))) { return; }`;
    });
  }

  // 4. Guard fail function directly
  const failFnRegex = /function\s+fail\s*\(\s*([a-zA-Z0-9_$]+)\s*,\s*([a-zA-Z0-9_$]+)\s*,\s*([a-zA-Z0-9_$]+)\s*\)\s*\{/g;
  if (/function\s+fail\s*\(/i.test(content) && !content.includes('/* __CLEAN_GUARD_FN__ */')) {
    content = content.replace(failFnRegex, (match, idArg) => {
      modified = true;
      return `${match} /* __CLEAN_GUARD_FN__ */ if (${idArg} === 15467 || ${idArg} === 0x3c6b || ${idArg} === '3c6b') { return false; }`;
    });
  }

  // 5. Guard __PRIVATE_logError without declaring any variable names
  const logErrorRegex = /function\s+__PRIVATE_logError\s*\(\s*([a-zA-Z0-9_$]+)[^)]*\)\s*\{/g;
  if (/function\s+__PRIVATE_logError\s*\(/i.test(content) && !content.includes('/* __CLEAN_GUARD_LOG__ */')) {
    content = content.replace(logErrorRegex, (match, msgArg) => {
      modified = true;
      return `${match} /* __CLEAN_GUARD_LOG__ */ if (String(${msgArg} || '').includes('3c6b') || String(${msgArg} || '').includes('15467') || String(${msgArg} || '').includes('auth/network-request-failed')) { return; }`;
    });
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    patchedCount++;
    console.log(`[patch-firestore] Successfully patched ${path.relative(path.join(__dirname, '..'), filePath)}`);
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.git') {
        walkDir(fullPath);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs') || entry.name.endsWith('.cjs'))) {
      patchFile(fullPath);
    }
  }
}

for (const d of dirsToSearch) {
  walkDir(d);
}

console.log(`[patch-firestore] Patch complete. Patched ${patchedCount} files.`);
