with open('src/pages/Relatorios.tsx', 'r') as f:
    content = f.read()

content = content.replace("              </tr>\n              <tbody", "              </tr>\n            </thead>\n            <tbody")
content = content.replace("yled like image */}              <tr", "              <tr")

with open('src/pages/Relatorios.tsx', 'w') as f:
    f.write(content)
