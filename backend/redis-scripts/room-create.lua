-- KEYS[1]: room:<roomId>:meta
-- KEYS[2]: roomcode:<code>
-- KEYS[3]: user:<uid>:activeRoom
-- ARGV[1]: roomId
-- ARGV[2]: code
-- ARGV[3]: uid
-- ARGV[4]: configJson
-- ARGV[5]: nowMs
-- ARGV[6]: emptyRoomTtlSeconds

local meta_key = KEYS[1]
local code_key = KEYS[2]
local active_room_key = KEYS[3]

local room_id = ARGV[1]
local code = ARGV[2]
local uid = ARGV[3]
local config_json = ARGV[4]
local now_ms = ARGV[5]
local ttl_seconds = tonumber(ARGV[6])

local existing_room = redis.call('GET', active_room_key)
if existing_room and existing_room ~= '' then
  local existing_meta_key = 'room:' .. existing_room .. ':meta'
  if redis.call('EXISTS', existing_meta_key) == 1 then
    return {0, 'ALREADY_IN_ROOM', existing_room}
  end
end

if redis.call('EXISTS', code_key) == 1 then
  return {0, 'CODE_COLLISION'}
end

if redis.call('EXISTS', meta_key) == 1 then
  return {0, 'ROOM_EXISTS'}
end

redis.call(
  'HSET',
  meta_key,
  'roomId', room_id,
  'code', code,
  'type', 'private',
  'creatorUid', uid,
  'hostUid', uid,
  'state', 'idle',
  'config', config_json,
  'roundId', '',
  'roundSeed', '',
  'quoteId', '',
  'roundStartTime', '0',
  'endTime', '0',
  'starterCount', '0',
  'createdAt', now_ms,
  'updatedAt', now_ms
)

redis.call('EXPIRE', meta_key, ttl_seconds)
redis.call('SET', code_key, room_id, 'EX', ttl_seconds)
redis.call('SET', active_room_key, room_id, 'EX', ttl_seconds)

return {1, 'OK'}

