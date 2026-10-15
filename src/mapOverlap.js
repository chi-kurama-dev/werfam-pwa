// Visual marker positions are computed in CONTAINER pixels, never Leaflet layer pixels.
// Layer coordinates have a different origin after panning; GPS itself is never changed.
export function spreadOverlappingPins(points,map,threshold=92){
  const raw=points.map(p=>map.latLngToContainerPoint([Number(p.loc.latitude),Number(p.loc.longitude)]))
  const parent=raw.map((_,i)=>i)
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i}
  for(let i=0;i<raw.length;i++)for(let j=i+1;j<raw.length;j++){
    if(Math.hypot(raw[i].x-raw[j].x,raw[i].y-raw[j].y)<threshold){
      const a=root(i),b=root(j);if(a!==b)parent[b]=a
    }
  }
  const groups=new Map()
  for(let i=0;i<raw.length;i++){const k=root(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i)}
  const positions=new Map(),size=map.getSize()
  let overlapGroups=0,overlapMembers=0
  for(const indexes of groups.values()){
    if(indexes.length<2)continue
    const x=indexes.reduce((s,i)=>s+raw[i].x,0)/indexes.length
    const y=indexes.reduce((s,i)=>s+raw[i].y,0)/indexes.length
    if(x < -65 || x>size.x+65 || y < -65 || y>size.y+65)continue
    const count=indexes.length
    const ideal=count===2?52:Math.max(55,Math.ceil(94/(2*Math.sin(Math.PI/count))))
    const radius=Math.min(ideal,Math.max(37,Math.min(size.x,size.y)/2-38))
    const center=(value,limit)=>{
      const margin=radius+35
      return limit<margin*2?limit/2:Math.max(margin,Math.min(limit-margin,value))
    }
    const cx=center(x,size.x),cy=center(y,size.y)
    const order=[...indexes].sort((i,j)=>String(points[i].member.user_id).localeCompare(String(points[j].member.user_id)))
    order.forEach((index,ordinal)=>{
      const angle=count===2?Math.PI*ordinal:-Math.PI/2+2*Math.PI*ordinal/count
      positions.set(index,map.containerPointToLatLng({x:cx+radius*Math.cos(angle),y:cy+radius*Math.sin(angle)}))
    })
    overlapGroups++;overlapMembers+=count
  }
  return {positions,overlapGroups,overlapMembers}
}
