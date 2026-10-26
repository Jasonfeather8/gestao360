with open('src/components/NovoLancamentoDrawer.tsx', 'r') as f:
    content = f.read()

content = content.replace("showToast('Por favor, informe seu valor monetário válido acima de zero.', 'warning');\n      return;", "showToast('Por favor, informe seu valor monetário válido acima de zero.', 'warning');\n      setIsSubmitting(false);\n      return;")

content = content.replace("showToast('Por favor, preencha o destinatário / entidade.', 'warning');\n      return;", "showToast('Por favor, preencha o destinatário / entidade.', 'warning');\n      setIsSubmitting(false);\n      return;")

with open('src/components/NovoLancamentoDrawer.tsx', 'w') as f:
    f.write(content)
