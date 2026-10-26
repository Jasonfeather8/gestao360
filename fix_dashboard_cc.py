import re

with open('src/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

pattern = r"\{costCenterBreakdown\.map\(\(cc, i\) => \{"
replacement = """{costCenterBreakdown.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm text-secondary bg-surface-container p-4 rounded-lg border border-dashed border-surface-border">Nenhum dado financeiro para exibir.</span>
              </div>
            ) : costCenterBreakdown.map((cc, i) => {"""

content = content.replace(pattern, replacement)

with open('src/pages/Dashboard.tsx', 'w') as f:
    f.write(content)
