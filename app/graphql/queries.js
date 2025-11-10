// graphql/queries.js (frontend only)
import { gql } from "@apollo/client";

export const GET_NEIGHBORHOODS = gql`
  query GetNeighborhoods {
    neighborhoods {
      id
      name
      description
      type
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
      }
    }
  }
`;

export const GET_USER_BY_USERNAME = gql`
  query GetUserByUsername($username: String!) {
    userByUsername(username: $username) {
      id
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

export const JOIN_NEIGHBORHOOD = gql`
  mutation JoinNeighborhood($neighborhoodId: ID!) {
    joinNeighborhood(neighborhoodId: $neighborhoodId) {
      id
      name
      members {
        user {
          username
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

export const LEAVE_NEIGHBORHOOD = gql`
  mutation LeaveNeighborhood($neighborhoodId: ID!) {
    leaveNeighborhood(neighborhoodId: $neighborhoodId)
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