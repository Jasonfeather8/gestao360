with open('server.ts', 'r') as f:
    content = f.read()

replacement = """
  const getPort = () => {
    if (process.env.PORT) return parseInt(process.env.PORT, 10);
    const args = process.argv.slice(2);
    const portIndex = args.indexOf('--port');
    if (portIndex > -1 && args[portIndex + 1]) {
      return parseInt(args[portIndex + 1], 10);
    }
    return 3000;
  };
  const PORT = getPort();
"""

content = content.replace("  const PORT = 3000;", replacement)

with open('server.ts', 'w') as f:
    f.write(content)
