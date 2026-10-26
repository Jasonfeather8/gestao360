import re

with open('src/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

# Replace the fake data logic inside costCenterBreakdown mapping
pattern = r"const fallbackCCNames = \['Marketing', 'Operações', 'TI', 'RH'\];.*?const rPct = Math\.min\(\(ccEntrada / maxLimit\) \* 100, 100\);"
replacement = """const ccNameStr = cc.nome;
              let ccEntrada = cc.entradas;
              let ccSaida = cc.saidas;

              // Find maximum value to normalize
              const maxGlobal = Math.max(...costCenterBreakdown.map(c => Math.max(c.entradas, c.saidas, 1)));
              const maxLimit = maxGlobal * 1.1; // Add 10% headroom

              const rPct = Math.min((ccEntrada / maxLimit) * 100, 100);"""

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('src/pages/Dashboard.tsx', 'w') as f:
    f.write(content)
