import re

with open('src/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

# Replace the static cards for totals
content = re.sub(
    r'\{valueFormatter\(periodFilter === \'all\' \|\| periodFilter === \'2023-10\' \? 124500 : totals.consolidatedBalance\)\}',
    r'{valueFormatter(totals.consolidatedBalance)}',
    content
)
content = re.sub(
    r'\{valueFormatter\(periodFilter === \'all\' \|\| periodFilter === \'2023-10\' \? 142300 : totals.simulatedBalance\)\}',
    r'{valueFormatter(totals.simulatedBalance)}',
    content
)
content = re.sub(
    r'\{valueFormatter\(periodFilter === \'all\' \|\| periodFilter === \'2023-10\' \? 17800 : totals.outPending\)\}',
    r'{valueFormatter(totals.outPending)}',
    content
)

# Replace the static accounts list
accounts_pattern = r'<div ref=\{dragScrollAccounts\.ref\}.*?</div>\s*</section>'

replacement = """<div ref={dragScrollAccounts.ref} {...dragScrollAccounts.props} className="flex gap-4 overflow-x-auto pb-2 scroll-smooth select-none" style={{ cursor: 'grab', userSelect: 'none' }}>
          {accountsBalances.length === 0 ? (
            <div className="text-sm text-secondary bg-surface-container p-4 rounded-lg flex-1 text-center border border-dashed border-surface-border">
              Nenhuma conta bancária cadastrada.
            </div>
          ) : (
            accountsBalances.map((acc, index) => {
              const bgColors = ['bg-[#FF6200]/10', 'bg-[#cc092f]/10', 'bg-[#8a05be]/10', 'bg-blue-500/10'];
              const textColors = ['text-[#FF6200]', 'text-[#cc092f]', 'text-[#8a05be]', 'text-blue-500'];
              const colorIdx = index % bgColors.length;
              return (
                <div key={acc.id} className="flex-shrink-0 w-64 bg-white dark:bg-surface p-4 border border-surface-border rounded-lg flex items-center justify-between group cursor-pointer hover:border-primary transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${bgColors[colorIdx]} flex items-center justify-center font-bold ${textColors[colorIdx]} shrink-0 uppercase`}>
                      {acc.nome.substring(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-on-surface truncate w-24" title={acc.nome}>{acc.nome}</p>
                      <p className="text-xs text-secondary truncate w-24">{acc.agencia} {acc.conta}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold font-mono text-on-surface">
                    {valueFormatter(acc.consolidated || 0)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>"""

content = re.sub(accounts_pattern, replacement, content, flags=re.DOTALL)

with open('src/pages/Dashboard.tsx', 'w') as f:
    f.write(content)

