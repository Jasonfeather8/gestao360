import re

with open('src/pages/Cadastros.tsx', 'r') as f:
    content = f.read()

pattern = r"<tbody className=\"text-xs\">\s*\{categorias\.map\(cat => \("
replacement = """<tbody className="text-xs">
                {categorias.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-on-surface-variant text-sm font-bold border-b border-surface-border">
                      Nenhuma categoria financeira cadastrada.
                    </td>
                  </tr>
                ) : categorias.map(cat => ("""

content = re.sub(pattern, replacement, content)

with open('src/pages/Cadastros.tsx', 'w') as f:
    f.write(content)

