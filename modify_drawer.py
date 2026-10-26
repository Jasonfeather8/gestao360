import re

with open('src/components/NovoLancamentoDrawer.tsx', 'r') as f:
    content = f.read()

# Add isSubmitting state
if 'const [isSubmitting, setIsSubmitting]' not in content:
    content = content.replace(
        "const [toasts, setToasts]",
        "const [isSubmitting, setIsSubmitting] = useState(false);\n  const [toasts, setToasts]"
    )

# Add setIsSubmitting to handleFormSubmit
if 'setIsSubmitting(true);' not in content:
    content = content.replace(
        "const handleFormSubmit = async (e: React.FormEvent) => {",
        "const handleFormSubmit = async (e: React.FormEvent) => {\n    e.preventDefault();\n    setIsSubmitting(true);"
    )
    content = content.replace(
        "e.preventDefault();\n",
        ""
    )
    content = content.replace(
        "} catch (error) {",
        "} catch (error) {\n      console.error(error);"
    )
    # Add finally block
    content = re.sub(
        r"(showToast\('Erro ao salvar lançamento\.', 'error'\);\n\s*})",
        r"\1 finally {\n      setIsSubmitting(false);\n    }",
        content
    )

# Disable submit button and add spinner
if 'disabled={isSubmitting}' not in content:
    content = re.sub(
        r'<button\s*type="submit"\s*className="([^"]+)"\s*>',
        r'<button type="submit" disabled={isSubmitting} className="\1 disabled:opacity-70 disabled:cursor-not-allowed">',
        content
    )
    content = re.sub(
        r'(<button type="submit"[^>]*>)\s*([^<]+)\s*</button>',
        r'\1\n                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" /> : null}\n                  \2\n                </button>',
        content
    )

with open('src/components/NovoLancamentoDrawer.tsx', 'w') as f:
    f.write(content)
