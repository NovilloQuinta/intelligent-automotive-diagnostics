import { createFileRoute } from '@tanstack/react-router'
import { KnowledgePanel } from '@/components/admin/KnowledgePanel'

export const Route = createFileRoute('/admin/knowledge')({
  component: AdminKnowledge,
})

function AdminKnowledge() {
  return (
    <div className="p-6">
      <KnowledgePanel />
    </div>
  )
}
