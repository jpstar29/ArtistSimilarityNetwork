import Sigma from "sigma";
import Graph from "graphology";
import { parse } from "graphology-gexf";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {bidirectional} from 'graphology-shortest-path';


import { scaleOrdinal } from "d3-scale";
import { schemeTableau10 } from "d3-scale-chromatic";

import noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css';


const communities = {"Synthwave":0, "Hip-Hop":1, "Ambient":2, "Soft Pop/Indonesia":3, "Indie/Alternative Rock":4, "Punk Rock":5,
                    "Instrumental Jazz":6, "Classic 80s Rock":7, "Classic 60s Rock":8, "Memphis Rap":9, "R&B":10, "Vocal Jazz":11,
                    "Salsa":12, "Brazilian":13, "Reggae":14, "Country":15, "Chill Electronic":16, "Spanish Pop":17, "Ambient Electronic":18,
                    "Chile":19, "Japanese":20, "Classical":21, "Metal":22, "Reggaeton":23, "Shoegaze":24, "Bossa Nova":25, "Pop":26, "French":27,"Chinese":28,
                    "Ambient Piano":29, "K-pop Boy Groups":30, "K-pop Girl Groups":31, "Nigeria":32, "Soundtrack":33, "Progressive Rock":34, "Industrial":35,
                    "Indie Pop":36, "Grunge Rock":37, "Soul":38, "Underground Indie":39, "Electric Pop":40}; //This is my own intereptation of the data from the tags of each artist found in each community, seen in the folder GraphImages.

//Colours
const backgroundColour = [53, 53, 53];

const fadedAdditionEdge = 4; //The smaller the value is, the closer it is to the background (and therefore the harder it is to see). 
const fadedEdgesColour = [backgroundColour[0] + fadedAdditionEdge, backgroundColour[1] + fadedAdditionEdge, backgroundColour[2] + fadedAdditionEdge];

const fadedAdditionNode = 27; //The smaller the value is, the closer it is to the background (and therefore the harder it is to see). The nodes should be a little brighter than the edges.
const fadedNodesColour = [backgroundColour[0] + fadedAdditionNode, backgroundColour[1] + fadedAdditionNode, backgroundColour[2] + fadedAdditionNode]; 

//Container
const container = document.getElementById("sigma-container");

//Control Panel: Search for Artist
const artistSearch = document.getElementById("artist-search");
const searchButton = document.getElementById("search-button");

//Shortest Path HTML Elements
const pathArtistOne = document.getElementById("path-artist-1")
const pathArtistTwo = document.getElementById("path-artist-2")
const pathButton = document.getElementById("path-button");

//Reset
const resetButton = document.getElementById("reset");

//Search for Genres
const genreInput = document.querySelector('input[list="genre-options"]');
const genreOptions = document.getElementById('genre-options');

//Ranges
const similarityRange = document.getElementById("similarity-range");
const listenersRange = document.getElementById("listeners-range");

//Metadata Panel: Updated related artists
const relatedArtists = document.getElementById("related-artists");
const relatedArtistsTitle = document.getElementById("related-artists-title");

let graph, renderer;

// Type and declare internal state:
class State {
    hoveredNode;
    searchQuery;
    highlightNodes = [];
    showhighlightNodesNeighbours = true;
    displayShortestPath = false; //Now we want to see nodes by community, we have to distinguish whether we want to see the shortest path.

    // State derived from query:
    selectedNode;
    suggestions = new Set();

    // State derived from hovered node:
    hoveredNeighbors = new Set(); 

    selectedCommunity

    similarityRangeMin = 0;
    similarityRangeMax = 1;
    
    listenersRangeMin = 0;
    listenersRangeMax = 0;

  }
const state = new State();

function combineSetAndArray(set, array) {
  let newSet = set
  for (let item of array) {
    newSet.add(item);
  }
  return newSet;
}

function returnRGBString(array) {
  //Given an array of 3 indices, returns the RGB String associated
  let color = "rgb(" + array[0] + ", " + array[1] + ", " + array[2] + ")";
  return color;
}

function addTransparency(colour, transparency) {
  //Colour is in the string form: "rgb(x, x, x)"
  let colourArray = ['', '', '']; //Each index corresponds to the rgb values, so like [128,128,128]
  const targetArray = backgroundColour; //This is the background as a rgb value. The idea is that this represents 100% transparency (as any colour that is set to this won't be seen.)
  //We need a scale from the original rgb colour to the target. 
  let rgb = 0;
  colour = colour.trim(); //Removing all unnecessary spaces in case they are there

  for (let character = 4; character < colour.length; character++) {
     if (colour.charAt(character) == ",") {
      rgb++; //We've extracted all the numbers from the previous value, so we can move on to the next in the rgb series.
      continue
     } else if (colour.charAt(character) == ")") {
      break; //We've reached the end of the string
     }
     colourArray[rgb] += colour.charAt(character);
  }

  let colourScale; 
  for (let colourIndex = 0; colourIndex < colourArray.length; colourIndex++) { //Either red, green, or blue (depending on colourIndex)
    colourArray[colourIndex] = Number(colourArray[colourIndex]) //Casting it to an integer
    colourScale = targetArray[colourIndex] - colourArray[colourIndex] //Finding the difference between the current colour value and the target
    colourScale *= (1 - transparency); //Scaling it to our colour range
    colourArray[colourIndex] = Math.round(colourArray[colourIndex] + colourScale); //Replacing it in the list
  }

  return `rgb(${colourArray[0]}, ${colourArray[1]}, ${colourArray[2]})`;
}

function updateArtistPathLabels(value) {
  if (pathArtistOne.value == "") {
    pathArtistOne.value = value; //If we're updating the display, we should update these too.
  } else {
    pathArtistTwo.value = value;
  }
}

function updateMetadata(node) {  
  
  let artistName = graph.getNodeAttribute(node, "artist_name"); //Using a variable just for this since we need it twice
  document.getElementById("artist-name").textContent = artistName;

  const genreCommunity = Object.keys(communities).find(key => communities[key] === graph.getNodeAttribute(node, "communityID")); //Finding the community of the node, and seeing which genre it's associated with in the dictionary

  let tags = graph.getNodeAttribute(node, "tags");
  tags = tags.replace(/\[|\]/g,'').split(',').map(item => item.trim().replace(/'/g, '')); //This turns '['A', 'B', 'C']' into ['A', 'B', 'C'] =
  let tagString = "";
  for (let tag of tags) {
    tagString += tag + ", " //Getting rid of the first and last characters since they're single quotes
  }
  document.getElementById("artist-tags").textContent = `Tags: ${tagString.slice(0, tagString.length - 2)}`; //.length - 2 to get rid of the comma at the end
  document.getElementById("artist-genre").textContent = `Genre: ${genreCommunity}`;
  document.getElementById("artist-popularity").textContent = `Listeners: ${graph.getNodeAttribute(node, "listeners")}`;

  // 1. Clear the old list
  relatedArtists.innerHTML = "";

  let messages = []; //Array of dictionaries, to be sorted by weight later

  for (let neighbourNode of graph.neighbors(node)) {
    let artistName = graph.getNodeAttribute(neighbourNode, "artist_name");
    let similarity = Math.round(graph.getEdgeAttribute(graph.edge(node, neighbourNode), "weight") * 10000) / 100; //Multiplying it by 100 and dividing it by 100 to round it to 2d.p. But really 10000 because we want it as a percentage.
    messages.push({"message":`${artistName} who is ${similarity}% similar`, "weight":similarity});
  };

  messages.sort((a, b) => b.weight - a.weight); //Sort by high to low

  messages.forEach(message => {
    const li = document.createElement("li");
    li.textContent = message["message"];
    relatedArtists.appendChild(li);
  })
}

function reset() {
  state.highlightNodes = [];
  state.hoveredNode = undefined;
  state.hoveredNeighbors = new Set();
  
  state.suggestions = new Set();
  state.selectedNode = undefined;
  state.showhighlightNodesNeighbours = true; 
  state.displayShortestPath = false;

  pathArtistOne.value = "";
  pathArtistTwo.value = "";

      // Refresh rendering
    renderer.refresh({
      // We don't touch the graph data so we can skip its reindexation
      skipIndexation: true,
    });
}

function convertScale(initialNumber, maxNumber) {
    //Given a number between 0 and 1, it'll convert it to 0 and maxNumber.
    //Presume for now that we want it between 1 - minNumber and 1. 
    
    const scale = 1 / maxNumber;
    return (initialNumber / scale);
}

function errorAnimate(input) {
  input.classList.add("search-error");
  setTimeout(() => input.classList.remove("search-error"), 1000); //Remove it after a second.
}

function setHoveredNode(node) {
    if (node) {
      state.hoveredNode = node; //Selecting the node 
      state.hoveredNeighbors = new Set(graph.neighbors(node));
    }

    if (!node) {
      state.hoveredNode = undefined;
      state.hoveredNeighbors = new Set();
    }
    
    // Refresh rendering
    renderer.refresh({
      // We don't touch the graph data so we can skip its reindexation
      skipIndexation: true,
    });

  }

function selectNode(node) {
  //When the user either clicks or selects a node, we call this to update and whatnot. 
  state.displayShortestPath = false;
  updateMetadata(node);
  updateArtistPathLabels(graph.getNodeAttribute(node, "artist_name"));

  if (!(state.highlightNodes.includes(node))) {
    state.highlightNodes.push(node); //Node is the same as hovered node (because the mouse is on top of it)
  }

  relatedArtistsTitle.textContent = "Top Related Artists";

  renderer.refresh({
    skipIndexation: true, //Update the graph, just in case the user has deselected the node.
  });
}

function addUserNode(query, refresh) {
  query = query.trim(); //Trimming any unnesscary white space before or after the string.
  const lcQuery = query.toLowerCase();
  const suggestions = graph
          .nodes()
          .map((n) => ({ id: n, label: graph.getNodeAttribute(n, "label")}))
          .filter(({ label }) => label.toLowerCase().includes(lcQuery));
  state.suggestions = new Set(suggestions.map(({ id }) => id));

  if (state.suggestions.size == 0) {
    return "ERROR: invalidArtist";
  }
    
  let foundNode;
  for (let suggestion of suggestions) {
    if (suggestion.label == query) {
      foundNode = suggestion.id; //There was an exact match with the query that we got. Let's use this rather than our best suggestion.
    }
  }
  if (foundNode == undefined) {
    foundNode = suggestions[0].id; //ERROR - This is really bad at the moment. We just choose the first one since it's the most likely one. In future, it would be nice to show all the suggestions and let the user pick the one they meant.
  }

  let nodeListeners = graph.getNodeAttribute(foundNode, "listeners");
  if (nodeListeners > state.listenersRangeMax || nodeListeners < state.listenersRangeMin) { //We could find the artist but it's currently hidden.
    state.suggestions = new Set(); //Make sure the nodes that were suggested were empty.
    return "ERROR: nodeListenersNotInRange";
  }

  if (!(state.highlightNodes.includes(foundNode))) {
    state.highlightNodes.push(foundNode);
  }

  state.suggestions = new Set();

  if (refresh) {
    state.selectedNode = foundNode;
    updateArtistPathLabels(graph.getNodeAttribute(state.selectedNode, "artist_name"));
    updateMetadata(state.selectedNode);

    const nodePosition = renderer.getNodeDisplayData(state.selectedNode);
    
    relatedArtistsTitle.textContent = "Top Related Artists";

    renderer.getCamera().animate(nodePosition, {
      duration: 500
    });

    renderer.refresh({
      skipIndexation: true,
    });
    
  }

  return foundNode;
}

function displayShortestPath () {

  //state.highlightNodes = ['cc197bad-dc9c-440d-a5b5-d52ba2e14234', '8da127cc-c432-418f-b356-ef36210d82ac']
  
  let sourceNode,  targetNode;
  //Since the code is identical, there might be a way to use a nested function to save space. But for now this works.

  if (pathArtistOne.value != "") {
    sourceNode = addUserNode(pathArtistOne.value, false); //If there's something in the text box we try that first.
  }

  if (sourceNode == "ERROR: invalidArtist" || sourceNode == undefined) {
      sourceNode = state.highlightNodes[0]; //If not, we just use whatever the user clicked on first.

      if (sourceNode == undefined) {
        errorAnimate(pathArtistOne); //If the user hasn't clicked anything then we return nothing.
        return;
      }
  } else if (sourceNode == "ERROR: nodeListenersNotInRange") {
    errorAnimate(pathArtistOne); //The artist we searched for has more listeners than the threshold. Let's stop here.
    return;
  }
  
  pathArtistOne.value = graph.getNodeAttribute(sourceNode, "label"); //In case it's different, show it so it's obvious what the source node is.

  if (pathArtistTwo.value != "") {
    targetNode = addUserNode(pathArtistTwo.value, false);
  }
  if (targetNode == "ERROR: invalidArtist" || targetNode == undefined || targetNode == sourceNode) {
    targetNode = state.highlightNodes[state.highlightNodes.length - 1];

    if (targetNode == undefined || targetNode == sourceNode) {
        errorAnimate(pathArtistTwo); //If the user hasn't clicked anything (or it's the same node, because there's no point) then we return nothing.
        return;
      }
  } else if (targetNode == "ERROR: nodeListenersNotInRange") {
    errorAnimate(pathArtistTwo); //The artist we searched for has more listeners than the threshold. Let's stop here.
    return;
  }

  pathArtistTwo.value = graph.getNodeAttribute(state.highlightNodes[state.highlightNodes.length - 1], "label"); //If there is no value there, show it so it's obvious what the source node is.

  const path = bidirectional(graph, sourceNode, targetNode);

  relatedArtists.innerHTML = "";
  let nodeCounter = 0;
  for (let node of path) {
    state.highlightNodes.push(node) //Add it to the nodes to be displayed
    if (nodeCounter != 0) { //Probably an easier way to do this
      const li = document.createElement("li"); //Create a new list item
      li.textContent = `${graph.getNodeAttribute(path[nodeCounter - 1], "artist_name")} connects to ${graph.getNodeAttribute(path[nodeCounter], "artist_name")}`;
      relatedArtists.appendChild(li);
    }
    nodeCounter++;
  }
  relatedArtistsTitle.textContent = "Connecting Artists";

  state.showhighlightNodesNeighbours = false; //We just want to see the path.
  state.displayShortestPath = true;

  renderer.refresh({
      skipIndexation: true,
  });
}

function showCommunityNodes(communityID) {
  state.highlightNodes = [];
  state.showhighlightNodesNeighbours = false;
  graph.forEachNode(node => {
    if (graph.getNodeAttribute(node, "communityID") == communityID) {
      state.highlightNodes.push(node);
    }
  });

  renderer.refresh({
      skipIndexation: true,
  });
}

function readUserNode() {
  if (addUserNode(artistSearch.value || "", true).startsWith("ERROR")) {
    //We weren't able to find the artist. So let's display that information to the user.
    errorAnimate(artistSearch);
    return;
  }
}

function main() {

  artistSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        readUserNode();
      }
  });

  searchButton.addEventListener("click", () => {
    readUserNode();
  });

  for (let community in communities) {
    const option = document.createElement('option');
    option.value = community;
    genreOptions.appendChild(option);
  }

  genreInput.addEventListener('input', function(e) {
      const selectedValue = e.target.value;

      // 1. Check if the value matches one of your pre-established categories
      // (This prevents the code from running if they just type a single letter)
      
      if (selectedValue in communities) {
        showCommunityNodes(communities[selectedValue])
      }
  });

  pathButton.addEventListener("click", () => {
    displayShortestPath();
  });

  noUiSlider.create(similarityRange, {
    start: [0, 1], // The initial positions (the most extreme because we want to see the full graph)
    connect: true, // This creates the "pretty" bar
    range: {
        'min': 0,
        'max': 1
    },
    step: 0.01,
    pips: { // Show a scale with the slider
      mode: 'count',
      values: 6, //This splits it into 5 even sections, so we need 6 numbers
      format: {
            // Making the numbers remain as decimals and not rounded.
            to: function (value) {
                return value.toFixed(1); // Returns "0.1", "0.2"
            },
            from: function (value) {
                return Number(value);
            }
        }
    }
  });

  resetButton.addEventListener("click", () => {
    reset();
  });

  fetch("artistsColouredTaggedGephi.gexf")
    .then(res => res.text())
    .then(gexf => {
      graph = parse(Graph, gexf);
      console.log("Graph loaded! Nodes:", graph.order);

      renderer = new Sigma(graph, container, {
        labelRenderedSizeThreshold : 15,
        minCameraRatio: 0.01, // Minimum zoom (zoomed in)
        maxCameraRatio: 1,  // Maximum zoom (zoomed out)
        enableEdgeEvents: false,
        zIndex : true, //Allow for layering of nodes (initally bigger nodes get layered on top)
        labelColor : {attribute: "labelColor", color: "rgb(210, 210, 210)"} //Initally the labels are white to contrast with the dark background.
        
      });

      let maximumListeners = -1; //We can do something (maybe clever) to find out the maximum size of listeners. Whilst attributing the necessary sizes and labels, we'll use a variable to check the maximum.

      graph.forEachNode((node, attributes) => {
          graph.setNodeAttribute(node, "size", attributes.size / 4);
          graph.setNodeAttribute(node, "label", attributes.artist_name); //Currently it's the MBID, but the artist's name is much more understandable.
          graph.setNodeAttribute(node, "zIndex", 10); //Let each node have a value of 10, to allow for nodes to have 0 (and therefore lower) values later. 1 should work, but giving it a little bit of buffer room.
          if (attributes.listeners > maximumListeners) {
            maximumListeners = attributes.listeners;
          }
      });

      //Now we can update the range of the listeners slider. Set it to the fullest range of the graph (maximumListeners).
      
      let listenersStep = Math.round(maximumListeners / 500); //Dividing the bar 
      
      if (listenersStep == 0) {
        listenersStep = 1; //Just in case somehow the number was less than 1 and got rounded down to 0
      }

      let listenersMax = Math.round(maximumListeners + maximumListeners / 100); //Just add 1% for a little bit of breathing room. It's because when we reduce and increase again, we aren't reaching the maximum anymore due to how step and the slider works.

      noUiSlider.create(listenersRange, {
        start: [0, listenersMax], // The initial positions (the most extreme because we want to see the full graph)
        connect: true, // This creates the "pretty" bar
        range: { //Implementing a logirthmic scale, since a lot of the nodes have small numbers of listeners. UPDATE: Currently, these numbers are made up so it would be nice to make them better.
            'min': 0,
            '10%':1000,
            '50%':100000,
            'max': listenersMax
        },
        step: listenersStep,

        pips: { // Show a scale with the slider
          mode: 'count',
          values: 6, //Keep it the same as the similarity scale
          format: {
            to: function (value) {
                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M'; //This is to decrease the size of the text, changing 1000000 to 1M.
                if (value >= 1000) return (value / 1000).toFixed(0) + 'K'; //This is to decrease the size of the text, changing 1000 to K.
                return value;
            }
          }
        }
      });
      
      listenersRange.noUiSlider.on('update', function (values, handle) {

        if (handle == 0) { //We've selected the left handle.
          state.listenersRangeMin = values[handle];
        }

        if (handle == 1) { //We've selected the right handle.
          state.listenersRangeMax = values[handle];
        }

        renderer.refresh({
          // We don't touch the graph data so we can skip its reindexation
          skipIndexation: true,
        });
      });

      similarityRange.noUiSlider.on('update', function (values, handle) {
        if (handle == 0) { //We've selected the left handle.
          state.similarityRangeMin = values[handle];
        }
        if (handle == 1) { //We've selected the right handle.
          state.similarityRangeMax = values[handle];
        }
        renderer.refresh({
          // We don't touch the graph data so we can skip its reindexation
          skipIndexation: true,
        });
      });


      graph.forEachEdge((edge, attributes, source, target) => {
          let sourceColour = graph.getNodeAttribute(source, "color");
          graph.setEdgeAttribute(edge, "baseColour", sourceColour);
          if (attributes.weight == undefined) { //ERROR: This is bad. This means there are edges with no weight attribute for some reason.
            attributes.weight = 0.5; //Assign a weight halfway between 0 and 1.
          }
          let transparency = convertScale(attributes.weight, 0.4) //Making any edge connection's transparency between two nodes a maximum of 0.4.
          sourceColour = addTransparency(sourceColour, transparency);
          graph.setEdgeAttribute(edge, "color", sourceColour);
          graph.setEdgeAttribute(edge, "zIndex", 10); //Let each node have a value of 10, to allow for nodes to have 0 (and therefore lower) values later. 1 should work, but giving it a little bit of buffer room.
      });

      // Bind graph interactions:
      renderer.on("enterNode", ({ node }) => {
          setHoveredNode(node);
      });

      renderer.on("clickNode", ({ node }) => {
        state.showhighlightNodesNeighbours = true; //In case the shortest path is still showing, deselect it.
        if (state.selectedNode == node) {
          state.selectedNode = undefined; //Unhighlight the node if it's been selected.
        } else {
          state.selectedNode = node; //Highlight the node.
        }
        
        selectNode(node)
      });

      renderer.on("leaveNode", () => {
        setHoveredNode(undefined);
      });

      renderer.on("downStage", () => {
        state.selectedNode = undefined; //Deselect the node.
          // Refresh rendering
        renderer.refresh({
          // We don't touch the graph data so we can skip its reindexation
          skipIndexation: true,
        });
      });

    // Render nodes accordingly to the internal state:
    // 1. If a node is selected, it is highlighted
    // 2. If there is query, all non-matching nodes are greyed
    // 3. If there is a hovered node, all non-neighbor nodes are greyed
    renderer.setSetting("nodeReducer", (node, data) => {
        const res = { ...data };

        if (res.listeners > state.listenersRangeMax || res.listeners < state.listenersRangeMin) {
          res.hidden = true;
          return res; //Don't do any more updating, we're hiding the node
        }

        if (state.selectedNode === node) {
          res.highlighted = true;
          res.labelColor = "#000000" // Since the node is selected, the white background behind the label appears. So change it from white to black to see it better.
        }

        if (state.hoveredNode === node) {
          res.labelColor = "#000000"  // Since the node is being hovered on, the white background behind the label appears. So change it from white to black to see it better.
        }

        let displayNodes = combineSetAndArray(state.hoveredNeighbors, state.highlightNodes); //These are all the nodes we want to see. This seems quite inefficient though. 
        for (let node of state.highlightNodes) {
          if (state.showhighlightNodesNeighbours) {
            for (let neighbourNode of graph.neighbors(node)) {
              displayNodes.add(neighbourNode); //Making sure all the neighboured nodes are highlighted.
            }
          }
        }

        if ((displayNodes.size != 0 && !displayNodes.has(node) && state.hoveredNode !== node)) {
          res.label = "";
          res.color = returnRGBString(fadedNodesColour);
          res.zIndex = 0; //Layer them below the nodes that we want to see. 
        }

        if (state.suggestions.size != 0) {
          if (state.suggestions.has(node)) {
            res.forceLabel = true;
          } else {
            res.label = "";
            res.color = "#f6f6f6";
          }
        }

        return res;
    });

    // Render edges accordingly to the internal state:
    // 1. If a node is hovered, the edge is hidden if it is not connected to the
    //    node
    // 2. If there is a query, the edge is only visible if it connects two
    //    suggestions
    renderer.setSetting("edgeReducer", (edge, data) => {
      const res = { ...data };

      if (!(state.showhighlightNodesNeighbours)) {
        //If this is true then we don't want to see any of the neighbours.
        if (graph.extremities(edge).every((n) => state.highlightNodes.includes(n))) {
              if (state.displayShortestPath) {
                res.color = "rgb(255,255,255)" //If this is false, then we want to see the path. So we should make the edges really stand out - especially against the nodes that are being drawn over the edges.
              }
              return res;
            }
        res.color = returnRGBString(fadedEdgesColour);
        res.zIndex = 0;
        return res;
      }
      
      let colouredEdge = state.highlightNodes.length == 0 && !(state.hoveredNode);
      let displayNodes;
      if (state.highlightNodes.length != 0) {
        displayNodes = [...state.highlightNodes,  state.hoveredNode];
      } else {
        displayNodes = [state.hoveredNode];
      }
      
      for (let node of displayNodes) {
        if (
          node && graph.extremities(edge).every((n) => n === node || graph.areNeighbors(n, node))
        ) {
          colouredEdge = true;
        }
      }
      if (!(colouredEdge)) {

        res.color = returnRGBString(fadedEdgesColour);
        res.zIndex = 0;
      }

      if (
        state.suggestions.size != 0 && (!state.suggestions.has(graph.source(edge)) || !state.suggestions.has(graph.target(edge)))
      ) {
        res.hidden = true;
      }

      if (res.weight > state.similarityRangeMax || res.weight < state.similarityRangeMin) {
        res.hidden = true;
      }

      return res;
    });
  }).catch(err => console.error("Loading error:", err));
}

main();
