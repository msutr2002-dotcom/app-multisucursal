import React from 'react'

const StatCard = ({ title, value, mono, href, loading, error = false }) => {
  return (
    <div className="stat-cell h-100">
      <div className={`stat-value ${mono ? 'monto' : ''}`}>{loading || error ? '—' : value}</div>
      <a href={href} className="stat-label text-body-secondary">
        {title}
      </a>
    </div>
  )
}

export default StatCard
