import test from 'node:test'
import assert from 'node:assert/strict'
import {spreadOverlappingPins} from '../src/mapOverlap.js'

const fakeMap=({w=380,h=510,dx=200,dy=260,scale=10}={})=>({
  getSize:()=>({x:w,y:h}),
  latLngToContainerPoint:([lat,lng])=>({x:dx+lng*scale,y:dy-lat*scale}),
  containerPointToLatLng:({x,y})=>({lat:(dy-y)/scale,lng:(x-dx)/scale})
})
const member=(id,latitude=0,longitude=0)=>({member:{user_id:id},loc:{latitude,longitude,enabled:true}})
const px=(map,pos)=>map.latLngToContainerPoint([pos.lat,pos.lng])
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)

test('same-coordinate parent and child are two distinct, clickable pin positions',()=>{
  const map=fakeMap(),members=[member('parent'),member('child')]
  const snapshot=structuredClone(members)
  const result=spreadOverlappingPins(members,map)
  assert.equal(result.overlapMembers,2)
  assert.equal(result.overlapGroups,1)
  assert.equal(result.positions.size,2)
  const coords=[...result.positions.values()].map(p=>px(map,p))
  assert.ok(d(coords[0],coords[1])>=95)
  assert.deepEqual(members,snapshot,'true GPS positions must stay intact')
})
test('pan near edge does not place overlapping pins outside map',()=>{
  const map=fakeMap({dx:355,dy:485})
  const result=spreadOverlappingPins([member('parent'),member('A'),member('B'),member('C')],map)
  assert.equal(result.positions.size,4)
  const pixels=[...result.positions.values()].map(p=>px(map,p))
  for(const p of pixels){assert.ok(p.x>=0&&p.x<=380);assert.ok(p.y>=0&&p.y<=510)}
  for(let i=0;i<pixels.length;i++)for(let j=i+1;j<pixels.length;j++)
    assert.ok(d(pixels[i],pixels[j])>65,'avatars must not overlap')
})
test('separate families of pins and distant pins are not moved together',()=>{
  const map=fakeMap()
  const r=spreadOverlappingPins([member('A'),member('B'),member('C',0,16),member('D',0,16),member('E',13,0)],map)
  assert.equal(r.overlapGroups,2)
  assert.equal(r.positions.size,4)
  assert.equal(r.positions.has(4),false)
})
test('single and widely separated points stay at their true locations',()=>{
  const r=spreadOverlappingPins([member('A'),member('B',12,0)],fakeMap())
  assert.equal(r.overlapGroups,0)
  assert.equal(r.positions.size,0)
})
test('refresh at different zoom levels expands two identical GPS fixes',()=>{
  for(const scale of [2,8,22]){
    const r=spreadOverlappingPins([member('parent'),member('child')],fakeMap({scale}))
    assert.equal(r.positions.size,2)
  }
})

test('parent, son and daughter at exactly the same place each have a separate avatar',()=>{
 const map=fakeMap(),points=[member('parent'),member('son'),member('daughter')]
 points[0].member.relation='parent';points[1].member.relation='son';points[2].member.relation='daughter'
 const out=spreadOverlappingPins(points,map)
 assert.equal(out.overlapMembers,3)
 assert.equal(out.positions.size,3)
 const v=[...out.positions.values()].map(p=>px(map,p))
 for(let i=0;i<v.length;i++)for(let j=i+1;j<v.length;j++)assert.ok(d(v[i],v[j])>=90)
})
