import { describe, expect, it } from 'vitest'
import { ValidationError } from './errors'
import { fromFxTwitterStatus, fromTwitterApiV2Tweet } from './tweetAdapters'

describe('fromFxTwitterStatus', () => {
  // Shaped like a live `FxTwitterV2#getStatus('20')` call — Jack Dorsey's
  // first tweet — trimmed to the fields the adapter actually reads.
  const status = {
    id: '20',
    text: 'just setting up my twttr',
    author: {
      id: '12',
      screen_name: 'jack',
      name: 'jack',
      avatar_url: 'https://pbs.twimg.com/profile_images/1661201415899951105/azNjKOSH_200x200.jpg',
    },
  }

  it('maps id/screen_name/name/avatar_url onto TweetLike', () => {
    expect(fromFxTwitterStatus(status)).toEqual({
      id: '20',
      text: 'just setting up my twttr',
      author: {
        id: '12',
        username: 'jack',
        name: 'jack',
        avatarUrl: 'https://pbs.twimg.com/profile_images/1661201415899951105/azNjKOSH_200x200.jpg',
      },
    })
  })
})

describe('fromTwitterApiV2Tweet', () => {
  const tweet = { id: '20', text: 'just setting up my twttr', author_id: '12' }
  const includes = {
    users: [
      { id: '12', username: 'jack', name: 'jack', profile_image_url: 'https://cdn.test/jack.png' },
    ],
  }

  it('matches the author by author_id and maps the fields onto TweetLike', () => {
    expect(fromTwitterApiV2Tweet(tweet, includes)).toEqual({
      id: '20',
      text: 'just setting up my twttr',
      author: { id: '12', username: 'jack', name: 'jack', avatarUrl: 'https://cdn.test/jack.png' },
    })
  })

  it('rejects a tweet with no matching author in includes.users', () => {
    expect(() => fromTwitterApiV2Tweet(tweet, { users: [] })).toThrow(ValidationError)
    expect(() => fromTwitterApiV2Tweet(tweet)).toThrow(ValidationError)
  })
})
