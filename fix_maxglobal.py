import re

with open('src/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

content = content.replace("const maxGlobal = Math.max(...costCenterBreakdown.map(c => Math.max(c.entradas, c.saidas, 1)));", "const maxGlobal = costCenterBreakdown.length > 0 ? Math.max(...costCenterBreakdown.map(c => Math.max(c.entradas, c.saidas, 1))) : 1;")

with open('src/pages/Dashboard.tsx', 'w') as f:
    f.write(content)
