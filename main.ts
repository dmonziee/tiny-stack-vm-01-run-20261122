// Tiny stack VM for make.fun's tiny-stack-vm-01 ISA v1. Reads
// /input/<id>/program.bin and input.bin, writes /output/<id>/stdout.bin
// and exit.txt. 32-bit wrapping ints, 256-value stack, 64-deep call stack,
// 256 words of memory. A trap ends the program with the trap's exit code
// and keeps the output written before it.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function run(p, inp) {
  const n = p.length, mem = new Int32Array(256), st = new Int32Array(257),
    cs = new Int32Array(64), out = [];
  let sp = 0, cp = 0, pc = 0, steps = 0, ip = 0;
  const end = (c) => ({ out, code: c });
  for (;;) {
    if (steps >= 1e6) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc];
    steps++;
    switch (op) {
      case 0x00: return end(0);
      case 0x01:
        if (pc + 2 > n) return end(9);
        if (sp > 255) return end(3);
        st[sp++] = (p[pc + 1] << 24) >> 24;
        pc += 2;
        break;
      case 0x02:
        if (pc + 5 > n) return end(9);
        if (sp > 255) return end(3);
        st[sp++] = p[pc + 1] | (p[pc + 2] << 8) | (p[pc + 3] << 16) | (p[pc + 4] << 24);
        pc += 5;
        break;
      case 0x03:
        if (sp < 1) return end(2);
        sp--;
        pc++;
        break;
      case 0x04:
        if (sp < 1) return end(2);
        if (sp > 255) return end(3);
        st[sp] = st[sp - 1];
        sp++;
        pc++;
        break;
      case 0x05:
        if (sp < 2) return end(2);
        const t = st[sp - 1];
        st[sp - 1] = st[sp - 2];
        st[sp - 2] = t;
        pc++;
        break;
      case 0x06:
        if (sp < 2) return end(2);
        if (sp > 255) return end(3);
        st[sp] = st[sp - 2];
        sp++;
        pc++;
        break;
      case 0x07:
        if (sp < 3) return end(2);
        const a = st[sp - 3], b = st[sp - 2], c = st[sp - 1];
        st[sp - 3] = b; st[sp - 2] = c; st[sp - 1] = a;
        pc++;
        break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        if (sp < 2) return end(2);
        const b = st[sp - 1], a = st[sp - 2];
        let r;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (!b) return end(4); r = (a / b) | 0; }
        else if (op === 0x14) { if (!b) return end(4); r = (a % b) | 0; }
        else if (op === 0x15) { if (!b) return end(4); r = ((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (!b) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << b;
        else if (op === 0x1d) r = a >> b;
        else if (op === 0x1e) r = (a >>> b) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        st[sp - 2] = r;
        sp--;
        pc++;
        break;
      }
      case 0x17:
        if (sp < 1) return end(2);
        st[sp - 1] = (-st[sp - 1]) | 0;
        pc++;
        break;
      case 0x1b:
        if (sp < 1) return end(2);
        st[sp - 1] = ~st[sp - 1];
        pc++;
        break;
      case 0x30:
        if (pc + 3 > n) return end(9);
        pc = pc + 3 + (((p[pc + 1] | (p[pc + 2] << 8)) << 16) >> 16);
        break;
      case 0x31: case 0x32: {
        if (pc + 3 > n) return end(9);
        if (sp < 1) return end(2);
        const v = st[--sp];
        if ((op === 0x31) === (v === 0)) {
          pc = pc + 3 + (((p[pc + 1] | (p[pc + 2] << 8)) << 16) >> 16);
        } else pc += 3;
        break;
      }
      case 0x33:
        if (pc + 3 > n) return end(9);
        if (cp > 63) return end(7);
        cs[cp++] = pc + 3;
        pc = p[pc + 1] | (p[pc + 2] << 8);
        break;
      case 0x34:
        if (cp === 0) return end(8);
        pc = cs[--cp];
        break;
      case 0x40:
        if (sp < 1) return end(2);
        if (st[sp - 1] < 0 || st[sp - 1] > 255) return end(6);
        st[sp - 1] = mem[st[sp - 1]];
        pc++;
        break;
      case 0x41: {
        if (sp < 2) return end(2);
        const addr = st[sp - 1], v = st[sp - 2];
        if (addr < 0 || addr > 255) return end(6);
        mem[addr] = v;
        sp -= 2;
        pc++;
        break;
      }
      case 0x50: {
        if (sp < 1) return end(2);
        const s = String(st[--sp]);
        if (out.length + s.length > 65536) return end(11);
        for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
        pc++;
        break;
      }
      case 0x51:
        if (sp < 1) return end(2);
        if (out.length > 65535) return end(11);
        out.push(st[--sp] & 255);
        pc++;
        break;
      case 0x52:
        if (sp > 255) return end(3);
        st[sp++] = ip < inp.length ? inp[ip++] : -1;
        pc++;
        break;
      case 0x53:
        if (sp < 1) return end(2);
        return end(st[--sp] & 255);
      default:
        return end(5);
    }
  }
}

const inDir = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

for (const e of readdirSync(inDir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
  if (!e.isDirectory()) continue;
  const d = join(inDir, e.name);
  const { out, code } = run(readFileSync(join(d, "program.bin")), readFileSync(join(d, "input.bin")));
  const od = join(outDir, e.name);
  mkdirSync(od, { recursive: true });
  writeFileSync(join(od, "stdout.bin"), Buffer.from(out));
  writeFileSync(join(od, "exit.txt"), String(code));
}
