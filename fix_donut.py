import re

with open('src/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

pattern = r"""<div \s*className="absolute inset-0 rounded-full border-\[16px\] border-bank-truth-green flex items-center justify-center overflow-visible"\s*style=\{\{ borderRightColor: '#D32F2F', borderBottomColor: '#FFA000' \}\}\s*/>\s*<div className="text-center z-10">\s*<p className="text-xl md:text-2xl font-black leading-none text-on-surface">100%</p>\s*<p className="text-xs font-bold text-secondary mt-1">R\$ 215k</p>\s*</div>"""

replacement = """<div 
                className="absolute inset-0 rounded-full border-[16px] border-bank-truth-green flex items-center justify-center overflow-visible"
                style={{ 
                  background: `conic-gradient(
                    #4CAF50 0% ${totals.paidPercent}%, 
                    #D32F2F ${totals.paidPercent}% ${totals.paidPercent + totals.unpaidPercent}%, 
                    #FFA000 ${totals.paidPercent + totals.unpaidPercent}% 100%
                  )`,
                  border: 'none',
                  borderRadius: '50%'
                }}
              >
                <div className="absolute inset-4 bg-white dark:bg-surface rounded-full"></div>
              </div>
              <div className="text-center z-10">
                <p className="text-xl md:text-2xl font-black leading-none text-on-surface">{(totals.paidCount + totals.unpaidCount + totals.bpiCount) > 0 ? '100%' : '0%'}</p>
                <p className="text-xs font-bold text-secondary mt-1">
                  Total Lançado
                </p>
              </div>"""

content = re.sub(pattern, replacement, content)

with open('src/pages/Dashboard.tsx', 'w') as f:
    f.write(content)
