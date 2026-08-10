// graphql/queries.js (frontend only)
import { gql } from "@apollo/client";



export const GET_USER_BY_USERNAME = gql`
  query GetUserByUsername($username: String!) {
    userByUsername(username: $username) {
      id
    }
  }
`;

export const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
      content
      feedType
      isPinned
      createdAt
      author {
        id
        username
        profilePhoto # ✅ ADD THIS!
      }
      media {
        url
        cid
        magnetURI
        mediaType
      }
      neighborhood {
        id
        name
      }
    }
  }
`;

export const GET_RANDOM_AFFILIATE_LINK = gql`
  query GetRandomAffiliateLink {
    randomAffiliateLink {
      id
      url
      title
      imageUrl
      description
      clicks
    }
  }
`;

export const GET_POSTS = gql`
  query GetPosts($neighborhoodId: ID) {
    posts(neighborhoodId: $neighborhoodId) {
      id
      content
      feedType
      isPinned
      createdAt
      author {
        id
        username
        profilePhoto # ✅ ADD THIS (like chat)
      }
      media {
        url
        cid
        magnetURI
        mediaType
      }
      neighborhood {
        id
        name
      }
    }
  }
`;
// For user profile
export const GET_USER = gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      username
      bio
      profilePhoto
      createdAt
    }
  }
`;

export const GET_MY_NEIGHBORHOODS = gql`
  query GetMyNeighborhoods {
    myNeighborhoods {
      id
      name
      description
      type
      owner {
        username
      }
      members {
        user {
          username
          profilePhoto
          bio
        }
        role
      }
    }
  }
`;


export const CREATE_NEIGHBORHOOD = gql`
  mutation CreateNeighborhood(
    $name: String!
    $description: String
    $type: String
  ) {
    createNeighborhood(name: $name, description: $description, type: $type) {
      id
      name
      description
      type
    }
  }

  
`;


// app/graphql/queries.js - Add this
export const GET_NEIGHBORHOOD = gql`
  query GetNeighborhood($id: ID!) {
    neighborhood(id: $id) {
      id
      name
      description
      type
      rules
      owner {
        username
        profilePhoto
        bio
      }
      members {
        user {
          username
          profilePhoto
          bio
        }
        role
        joinedAt
      }
      createdAt
    }
  }
`;

export const MY_NEIGHBORHOODS = gql`
  query MyNeighborhoods {
    myNeighborhoods {
      id
      name
      description
      type
      owner {
        id
        username
        profilePhoto
      }
      members {
        user {
          id
          username
          profilePhoto
        }
        role
        joinedAt
      }
      rules
      createdAt
      updatedAt
    }
  }
`;

export const GET_NEIGHBORHOODS = gql`
  query Neighborhoods {
    neighborhoods {
      id
      name
      description
      type
      owner {
        id
        username
        profilePhoto
      }
      members {
        user {
          id
          username
          profilePhoto
        }
        role
        joinedAt
      }
      joinRequests {
        user {
          id
          username
          profilePhoto
        }
        requestedAt
        status
      }
      rules
      createdAt
      updatedAt
    }
  }
`;

export const JOIN_NEIGHBORHOOD = gql`
  mutation JoinNeighborhood($neighborhoodId: ID!) {
    joinNeighborhood(neighborhoodId: $neighborhoodId) {
      id
      name
      description
      type
      members {
        user {
          id
          username
          profilePhoto
        }
        role
        joinedAt
      }
    }
  }
`;

export const LEAVE_NEIGHBORHOOD = gql`
  mutation LeaveNeighborhood($neighborhoodId: ID!) {
    leaveNeighborhood(neighborhoodId: $neighborhoodId)
  }
`;

// graphql/queries.js
// In your frontend, find the query that looks like:
export const VALIDATE_INVITE_LINK = gql`
  query ValidateInviteLink($code: String!) {
    validateInviteLink(code: $code) {
      isValid
      message
      link {
        id
        code
        name
        maxUses
        uses
        expiresAt
        role
        isActive
        createdAt
        # createdBy might not exist in the response
      }
      neighborhood {
        id
        name
        description
        type
        owner {
          id
          username
          profilePhoto
        }
        memberCount
      }
    }
  }
`;
// graphql/queries.js - Update CREATE_INVITE_LINK
// graphql/queries.js
export const CREATE_INVITE_LINK = gql`
  mutation CreateInviteLink(
    $neighborhoodId: ID!
    $name: String
    $maxUses: Int
    $expiresInDays: Int
    $role: String
  ) {
    createInviteLink(
      neighborhoodId: $neighborhoodId
      name: $name
      maxUses: $maxUses
      expiresInDays: $expiresInDays
      role: $role
    ) {
      id
      code
      name
      maxUses
      uses
      expiresAt
      role
      isActive
      url
      createdAt
      createdBy {
        id
        username
        profilePhoto
      }
    }
  }
`;

export const UPDATE_INVITE_LINK = gql`
  mutation UpdateInviteLink(
    $linkId: ID!
    $name: String
    $maxUses: Int
    $expiresAt: String
    $isActive: Boolean
  ) {
    updateInviteLink(
      linkId: $linkId
      name: $name
      maxUses: $maxUses
      expiresAt: $expiresAt
      isActive: $isActive
    ) {
      id
      code
      name
      maxUses
      uses
      expiresAt
      role
      isActive
      url
      createdBy {
        id
        username
        profilePhoto
      }
    }
  }
`;

export const DELETE_INVITE_LINK = gql`
  mutation DeleteInviteLink($linkId: ID!) {
    deleteInviteLink(linkId: $linkId)
  }
`;

export const DELETE_POST = gql`
  mutation DeletePost($postId: ID!) {
    deletePost(postId: $postId)
  }
`;

// graphql/queries.js - Update the query
export const GET_NEIGHBORHOOD_INVITE_LINKS = gql`
  query NeighborhoodInviteLinks($neighborhoodId: ID!) {
    neighborhoodInviteLinks(neighborhoodId: $neighborhoodId) {
      id
      code
      name
      maxUses
      uses
      expiresAt
      role
      isActive
      url
      createdAt
      createdBy {
        id
        username
        profilePhoto
      }
    }
  }
`;

export const JOIN_VIA_INVITE_LINK = gql`
  mutation JoinViaInviteLink($code: String!) {
    joinViaInviteLink(code: $code) {
      success
      message
      error
      neighborhood {
        id
        name
        description
        type
        members {
          user {
            id
            username
            profilePhoto
          }
          role
        }
      }
    }
  }
`;

export const REGISTER_AND_JOIN_VIA_LINK = gql`
  mutation RegisterAndJoinViaLink(
    $code: String!
    $username: String!
    $email: String!
    $password: String!
  ) {
    registerAndJoinViaLink(
      code: $code
      username: $username
      email: $email
      password: $password
    ) {
      token
      user {
        id
        username
        email
        profilePhoto
      }
    }
  }
`;