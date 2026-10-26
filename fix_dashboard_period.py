import re

with open('src/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

pattern = r"value=\{periodFilter === '2023-10'.*?\}"
replacement = r"""value={periodFilter === 'all' ? 'Todo o Período' : periodFilter === '2023-10' ? 'Outubro 2023' : periodFilter === '2026-06' ? 'Junho 2026' : customStart ? `${customStart} até ${customEnd}` : 'Filtrar'}"""

content = re.sub(pattern, replacement, content)

with open('src/pages/Dashboard.tsx', 'w') as f:
    f.write(content)
