import { redirect } from 'next/navigation'

/** The dashboard root is the list of businesses; cards live under their business. */
export default function DashboardPage() {
  redirect('/dashboard/kunden')
}
