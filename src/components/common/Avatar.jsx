import React from 'react'

const colors = [
  '#0d7a5f', // tinta
  '#0a4b3a', // tinta profunda
  '#33574a', // verde pizarra
  '#1f2937', // gris tinta
  '#b45309', // ámbar quemado
  '#15803d', // verde bosque
]

const getColor = (name) => {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

const sizes = { sm: 32, md: 40, lg: 48 }

const Avatar = ({ name = 'U', size = 'md' }) => {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const px = sizes[size] || sizes.md

  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: '50%',
        backgroundColor: getColor(name),
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: px * 0.4,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

export default Avatar
