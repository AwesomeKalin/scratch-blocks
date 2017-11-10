/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2012 Google Inc.
 * https://developers.google.com/blockly/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Procedure blocks for Scratch.
 */
'use strict';

goog.provide('Blockly.Blocks.procedures');

goog.require('Blockly.Blocks');
goog.require('Blockly.constants');


// TODO: Create a namespace properly.
Blockly.ScratchBlocks.ProcedureUtils = {};

// Serialization and deserialization.

/**
 * Create XML to represent the (non-editable) name and arguments of a procedure
 * call block (procedures_callnoreturn block).
 * @return {!Element} XML storage element.
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.callerMutationToDom = function() {
  var container = document.createElement('mutation');
  container.setAttribute('proccode', this.procCode_);
  container.setAttribute('argumentids', JSON.stringify(this.argumentIds_));
  container.setAttribute('warp', this.warp_);
  return container;
};

/**
 * Parse XML to restore the (non-editable) name and parameters of a procedure
 * call block (procedures_callnoreturn block).
 * @param {!Element} xmlElement XML storage element.
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.callerDomToMutation = function(xmlElement) {
  this.procCode_ = xmlElement.getAttribute('proccode');
  this.argumentIds_ = JSON.parse(xmlElement.getAttribute('argumentids'));
  this.warp_ = xmlElement.getAttribute('warp');
  this.updateDisplay_();
};

/**
 * Create XML to represent the (non-editable) name and arguments of a procedure
 * definition block (procedures_callnoreturn_internal, which is part of a definition,
 * or procedures_mutator_root).
 * @return {!Element} XML storage element.
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.definitionMutationToDom = function() {
  var container = document.createElement('mutation');
  container.setAttribute('proccode', this.procCode_);
  container.setAttribute('argumentids', JSON.stringify(this.argumentIds_));
  container.setAttribute('argumentnames', JSON.stringify(this.displayNames_));
  container.setAttribute('argumentdefaults',
      JSON.stringify(this.argumentDefaults_));
  container.setAttribute('warp', this.warp_);
  return container;
};

/**
 * Parse XML to restore the (non-editable) name and parameters of a procedure
 * definition block (procedures_callnoreturn_internal, which is part of a definition,
 * or procedures_mutator_root).
 * @param {!Element} xmlElement XML storage element.
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.definitionDomToMutation = function(xmlElement) {
  this.procCode_ = xmlElement.getAttribute('proccode');
  this.warp_ = xmlElement.getAttribute('warp');

  this.argumentIds_ = JSON.parse(xmlElement.getAttribute('argumentids'));
  this.displayNames_ = JSON.parse(xmlElement.getAttribute('argumentnames'));
  this.argumentDefaults_ = JSON.parse(
      xmlElement.getAttribute('argumentdefaults'));
  this.updateDisplay_();
};

// End of serialization and deserialization.

// Shared by all three procedure blocks.
/**
 * Returns the name of the procedure this block calls, or the empty string if
 * it has not yet been set.
 * @return {string} Procedure name.
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.getProcCode = function() {
  return this.procCode_;
};

/**
 * Update the block's structure and appearance to match the internally stored
 * mutation.
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.updateDisplay_ = function() {
  var wasRendered = this.rendered;
  this.rendered = false;

  if (this.paramMap_) {
    var connectionMap = this.disconnectOldBlocks_();
    this.removeAllInputs_();
  }

  this.createAllInputs_(connectionMap);
  this.deleteShadows_(connectionMap);

  this.rendered = wasRendered;
  if (wasRendered && !this.isInsertionMarker()) {
    this.initSvg();
    this.render();
  }
};

/**
 * Disconnect old blocks from all value inputs on this block, but hold onto them
 * in case they can be reattached later.
 * @return {!Object.<string, Blockly.Block>} An object mapping parameter IDs to
 *     the blocks that were connected to those IDs at the beginning of the
 *     mutation.
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.disconnectOldBlocks_ = function() {
  // Remove old stuff
  var connectionMap = {};
  for (var id in this.paramMap_) {
    var input = this.paramMap_[id];
    if (input.connection) {
      // Remove the shadow DOM.  Otherwise a shadow block will respawn
      // instantly, and we'd have to remove it when we remove the input.
      input.connection.setShadowDom(null);
      var target = input.connection.targetBlock();
      connectionMap[id] = target;
      if (target) {
        input.connection.disconnect();
      }
    }
  }
  return connectionMap;
};

/**
 * Remove all inputs on the block, including dummy inputs.
 * Assumes no input has shadow DOM set.
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.removeAllInputs_ = function() {
  // Delete inputs directly instead of with block.removeInput to avoid splicing
  // out of the input list at every index.
  for (var i = 0, input; input = this.inputList[i]; i++) {
    input.dispose();
  }
  this.inputList = [];
};

/**
 * Create all inputs specified by the new procCode, and populate them with
 * shadow blocks or reconnected old blocks as appropriate.
 * @param {!Object.<string, Blockly.Block>} connectionMap An object mapping
 *     parameter IDs to the blocks that were connected to those IDs at the
 *     beginning of the mutation.
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.createAllInputs_ = function(connectionMap) {
  this.paramMap_ = {};
  // Split the proc into components, by %n, %b, and %s (ignoring escaped).
  var procComponents = this.procCode_.split(/(?=[^\\]\%[nbs])/);
  procComponents = procComponents.map(function(c) {
    return c.trim(); // Strip whitespace.
  });
  // Create inputs and shadow blocks as appropriate.
  var inputCount = 0;
  for (var i = 0, component; component = procComponents[i]; i++) {
    var newLabel;
    if (component.substring(0, 1) == '%') {
      var inputType = component.substring(1, 2);
      if (!(inputType == 'n' || inputType == 'b' || inputType == 's')) {
        throw new Error(
            'Found an custom procedure with an invalid type: ' + inputType);
      }
      newLabel = component.substring(2).trim();

      var id = this.argumentIds_[inputCount];
      var oldBlock = null;
      if (connectionMap && (id in connectionMap)) {
        oldBlock = connectionMap[id];
      }
      var input = this.appendValueInput(id);
      if (inputType == 'b') {
        input.setCheck('Boolean');
      }
      this.populateInput_(inputType, inputCount, connectionMap, id, oldBlock, input);
      inputCount++;
    } else {
      newLabel = component.trim();
    }
    this.addLabel_(newLabel.replace(/\\%/, '%'));
  }
};

/**
 * Delete all shadow blocks in the given map.
 * @param {!Object.<string, Blockly.Block>} connectionMap An object mapping
 *     parameter IDs to the blocks that were connected to those IDs at the
 *     beginning of the mutation.
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.deleteShadows_ = function(connectionMap) {
  // Get rid of all of the old shadow blocks if they aren't connected.
  if (connectionMap) {
    for (var id in connectionMap) {
      var block = connectionMap[id];
      if (block && block.isShadow()) {
        block.dispose();
        connectionMap[id] = null;
      }
    }
  }
};
// End of shared code.

Blockly.ScratchBlocks.ProcedureUtils.addLabelCaller_ = function(text) {
  this.appendDummyInput().appendField(text);
};

Blockly.ScratchBlocks.ProcedureUtils.addLabelMutatorRoot_ = function(text) {
  if (text) {
    this.appendDummyInput(Blockly.utils.genUid()).
        appendField(new Blockly.FieldTextInput(text));
  }
};

/**
 * Build a DOM node representing a shadow block of the given type.
 * @param {string} type One of 's' (string) or 'n' (number).
 * @return {!Element} The DOM node representing the new shadow block.
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.buildShadowDom_ = function(type) {
  var shadowDom = goog.dom.createDom('shadow');
  if (type == 'n') {
    var shadowType = 'math_number';
    var fieldName = 'NUM';
    var fieldValue = '10';
  } else {
    var shadowType = 'text';
    var fieldName = 'TEXT';
    var fieldValue = 'hello world';
  }
  shadowDom.setAttribute('type', shadowType);
  var fieldDom = goog.dom.createDom('field', null, fieldValue);
  fieldDom.setAttribute('name', fieldName);
  shadowDom.appendChild(fieldDom);
  return shadowDom;
};

/**
 * Create a new shadow block and attach it to the given input.
 * @param {!Blockly.Input} input The value input to attach a block to.
 * @param {string} inputType One of 'b' (boolean), 's' (string) or 'n' (number).
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.attachShadow_ = function(input, inputType) {
  if (inputType == 'n' || inputType == 's') {
    var blockType = inputType == 'n' ? 'math_number' : 'text';
    var newBlock = this.workspace.newBlock(blockType);
    if (inputType == 'n') {
      newBlock.setFieldValue('99', 'NUM');
    } else {
      newBlock.setFieldValue('hello world', 'TEXT');
    }
    newBlock.setShadow(true);
    if (!this.isInsertionMarker()) {
      newBlock.initSvg();
      newBlock.render(false);
    }
    newBlock.outputConnection.connect(input.connection);
  }
};

/**
 * Create a new argument reporter block and attach it to the given input.
 * This function is used by the procedures_callnoreturn_internal block.
 * TODO (#1213) consider renaming.
 * @param {!Blockly.Input} input The value input to attach a block to.
 * @param {string} inputType One of 'b' (boolean), 's' (string) or 'n' (number).
 * @param {string} displayName The name of the argument as provided by the
 *     user, which becomes the text of the label on the argument reporter block.
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.attachArgumentReporter_ = function(
    input, inputType, displayName) {
  if (inputType == 'n' || inputType == 's') {
    var blockType = 'argument_reporter_string_number';
  } else {
    var blockType = 'argument_reporter_boolean';
  }
  var newBlock = this.workspace.newBlock(blockType);
  newBlock.setShadow(true);
  newBlock.setFieldValue(displayName, 'VALUE');
  if (!this.isInsertionMarker()) {
    newBlock.initSvg();
    newBlock.render(false);
  }
  newBlock.outputConnection.connect(input.connection);
};

/**
 * Create an input, attach the correct block to it, and insert it into the
 * params map.
 * This function is used by the procedures_callnoreturn block.
 * @param {string} type One of 'b' (boolean), 's' (string) or 'n' (number).
 * @param {number} index The index of this input into the argument id array.
 * @param {!Object.<string, Blockly.Block>} connectionMap An object mapping
 *     parameter IDs to the blocks that were connected to those IDs at the
 *     beginning of the mutation.
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.populateInputCaller_ = function(type, index,
    connectionMap, id, oldBlock, input) {
  if (connectionMap && oldBlock) {
    // Reattach the old block.
    connectionMap[id] = null;
    oldBlock.outputConnection.connect(input.connection);
    if (type != 'b') {
      input.connection.setShadowDom(this.buildShadowDom_(type));
    }
  } else {
    this.attachShadow_(input, type);
  }
  this.paramMap_[id] = input;
};

/**
 * Create an input, attach the correct block to it, and insert it into the
 * params map.
 * This function is used by the procedures_callnoreturn_internal block.
 * TODO (#1213) consider renaming.
 * @param {string} type One of 'b' (boolean), 's' (string) or 'n' (number).
 * @param {number} index The index of this input into the argument id and name
 *     arrays.
 * @param {!Object.<string, Blockly.Block>} connectionMap An object mapping
 *     parameter IDs to the blocks that were connected to those IDs at the
 *     beginning of the mutation.
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.populateInputCallerInternal_ = function(type,
    index, connectionMap, id, oldBlock, input) {
  var oldTypeMatches =
    Blockly.ScratchBlocks.ProcedureUtils.checkOldTypeMatches_(oldBlock, type);
  var displayName = this.displayNames_[index];
  if (connectionMap && oldBlock && oldTypeMatches) {
    // Reattach the old block, and update the text if needed.
    // The old block is the same type, and on the same input, but the input name
    // may have changed.
    oldBlock.setFieldValue(displayName, 'VALUE');
    connectionMap[id] = null;
    oldBlock.outputConnection.connect(input.connection);
  } else {
    this.attachArgumentReporter_(input, type, displayName);
  }
  this.paramMap_[id] = input;
};

/**
 * Create an input, attach the correct block to it, and insert it into the
 * params map.
 * This function is used by the procedures_callnoreturn_internal block.
 * TODO (#1213) consider renaming.
 * @param {string} type One of 'b' (boolean), 's' (string) or 'n' (number).
 * @param {number} index The index of this input into the argument id and name
 *     arrays.
 * @param {!Object.<string, Blockly.Block>} connectionMap An object mapping
 *     parameter IDs to the blocks that were connected to those IDs at the
 *     beginning of the mutation.
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.populateInputMutatorRoot_ = function(type,
    index, connectionMap, id, oldBlock, input) {
  var oldTypeMatches =
    Blockly.ScratchBlocks.ProcedureUtils.checkOldTypeMatches_(oldBlock, type);

  var displayName = this.displayNames_[index];
  if (connectionMap && oldBlock && oldTypeMatches) {
    oldBlock.setFieldValue(displayName, 'TEXT');
    connectionMap[id] = null;
    oldBlock.outputConnection.connect(input.connection);
  } else {
    this.attachShadow_(input, type, displayName);
  }
  this.paramMap_[id] = input;
};

/**
 * Check whether the type of the old block corresponds to the given input type.
 * @param {Blockly.BlockSvg} oldBlock The old block to check.
 * @param {string} type The input type.  One of 'n', 'n', or 's'.
 * @return {boolean} True if the type matches, false otherwise.
 */
Blockly.ScratchBlocks.ProcedureUtils.checkOldTypeMatches_ = function(oldBlock,
    type) {
  if (!oldBlock) {
    return false;
  }
  if ((type == 'n' || type == 's') &&
      oldBlock.type == 'argument_reporter_string_number') {
    return true;
  }
  if (type == 'b' && oldBlock.type == 'argument_reporter_boolean') {
    return true;
  }
  return false;
};

/**
 * Create a new shadow block and attach it to the given input.
 * @param {!Blockly.Input} input The value input to attach a block to.
 * @param {string} inputType One of 'b' (boolean), 's' (string) or 'n' (number).
 * @param {string} displayName The display name  of this argument, which is the
 *     text of the field on the shadow block.
 * @private
 * @this Blockly.Block
 */
Blockly.ScratchBlocks.ProcedureUtils.attachShadowMutatorRoot_ = function(input,
    inputType, displayName) {
  if (inputType == 'n' || inputType == 's') {
    var newBlock = this.workspace.newBlock('text');
  } else {
    var newBlock = this.workspace.newBlock('boolean_textinput');
  }
  newBlock.setFieldValue(displayName, 'TEXT');
  newBlock.setShadow(true);
  if (!this.isInsertionMarker()) {
    newBlock.initSvg();
    newBlock.render(false);
  }
  newBlock.outputConnection.connect(input.connection);
};

/**
 * Update the serializable information on the block based on the existing inputs
 * and their text.
 */
Blockly.ScratchBlocks.ProcedureUtils.updateProcCodeMutatorRoot_ = function() {
  this.procCode_ = '';
  this.displayNames_ = [];
  this.argumentIds_ = [];
  for (var i = 0; i < this.inputList.length; i++) {
    if (i != 0) {
      this.procCode_ += ' ';
    }
    var input = this.inputList[i];
    if (input.type == Blockly.DUMMY_INPUT) {
      this.procCode_ += input.fieldRow[0].getValue();
    } else if (input.type == Blockly.INPUT_VALUE) {
      var target = input.connection.targetBlock();
      this.displayNames_.push(target.getFieldValue('TEXT'));
      this.argumentIds_.push(input.name);
      if (target.type == 'boolean_textinput') {
        this.procCode_ += '%b';
      } else {
        this.procCode_ += '%s';
      }
    } else {
      throw new Error(
          'Unexpected input type on a procedure mutator root: ' + input.type);
    }
  }
};

/**
 * Externally-visible function to add a label field to the mutator root block.
 * @public
 */
Blockly.ScratchBlocks.ProcedureUtils.addLabelExternal = function() {
  this.procCode_ = this.procCode_ + ' label text';
  this.updateDisplay_();
};

/**
 * Externally-visible function to add a boolean field to the mutator root block.
 * @public
 */
Blockly.ScratchBlocks.ProcedureUtils.addBooleanExternal = function() {
  this.procCode_ = this.procCode_ + ' %b';
  this.displayNames_.push('boolean');
  this.argumentIds_.push(Blockly.utils.genUid());
  this.argumentDefaults_.push('todo');
  this.updateDisplay_();
};

/**
 * Externally-visible function to add a string/number field to the mutator root
 * block.
 * @public
 */
Blockly.ScratchBlocks.ProcedureUtils.addStringNumberExternal = function() {
  this.procCode_ = this.procCode_ + ' %s';
  this.displayNames_.push('string or number');
  this.argumentIds_.push(Blockly.utils.genUid());
  this.argumentDefaults_.push('todo');
  this.updateDisplay_();
};

Blockly.Blocks['procedures_defnoreturn'] = {
  /**
   * Block for defining a procedure with no return value.
   * @this Blockly.Block
   */
  init: function() {
    this.jsonInit({
      "message0": "define %1",
      "args0": [
        {
          "type": "input_statement",
          "name": "custom_block"
        }
      ],
      "extensions": ["colours_more", "shape_hat", "procedure_def_contextmenu"]
    });
  }
};

Blockly.Blocks['procedures_callnoreturn'] = {
  /**
   * Block for calling a procedure with no return value.
   * @this Blockly.Block
   */
  init: function() {
    this.jsonInit({
      "extensions": ["colours_more", "shape_statement", "procedure_call_contextmenu"]
    });
    this.procCode_ = '';
    /**
     * @type {!Object.<string, Blockly.Block>}
     * An object mapping parameter IDs to the blocks that are connected to those
     * IDs.
     */
    this.paramMap_ = null;
  },
  // Shared.
  getProcCode: Blockly.ScratchBlocks.ProcedureUtils.getProcCode,
  removeAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.removeAllInputs_,
  disconnectOldBlocks_: Blockly.ScratchBlocks.ProcedureUtils.disconnectOldBlocks_,
  deleteShadows_: Blockly.ScratchBlocks.ProcedureUtils.deleteShadows_,
  createAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.createAllInputs_,
  updateDisplay_: Blockly.ScratchBlocks.ProcedureUtils.updateDisplay_,

  // Exist on all three blocks, but have different implementations.
  mutationToDom: Blockly.ScratchBlocks.ProcedureUtils.callerMutationToDom,
  domToMutation: Blockly.ScratchBlocks.ProcedureUtils.callerDomToMutation,
  populateInput_: Blockly.ScratchBlocks.ProcedureUtils.populateInputCaller_,
  addLabel_: Blockly.ScratchBlocks.ProcedureUtils.addLabelCaller_,

  // Shared with procedures_mutator_root, but with a different implementation.
  attachShadow_: Blockly.ScratchBlocks.ProcedureUtils.attachShadow_,

  // Only exists on the external caller.
  buildShadowDom_: Blockly.ScratchBlocks.ProcedureUtils.buildShadowDom_
};

Blockly.Blocks['procedures_callnoreturn_internal'] = {
  /**
   * Block for calling a procedure with no return value, for rendering inside
   * define block.
   * @this Blockly.Block
   */
  init: function() {
    this.jsonInit({
      "extensions": ["colours_more", "shape_statement"]
    });

    /* Data known about the procedure. */
    this.procCode_ = '';
    this.displayNames_ = [];
    this.argumentDefaults_ = [];
    this.warp_ = false;

    /**
     * @type {!Object.<string, Blockly.Block>}
     * An object mapping parameter IDs to the blocks that are connected to those
     * IDs.
     */
    this.paramMap_ = null;
  },
  // Shared.
  getProcCode: Blockly.ScratchBlocks.ProcedureUtils.getProcCode,
  removeAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.removeAllInputs_,
  disconnectOldBlocks_: Blockly.ScratchBlocks.ProcedureUtils.disconnectOldBlocks_,
  deleteShadows_: Blockly.ScratchBlocks.ProcedureUtils.deleteShadows_,
  createAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.createAllInputs_,
  updateDisplay_: Blockly.ScratchBlocks.ProcedureUtils.updateDisplay_,

  // Exist on all three blocks, but have different implementations.
  mutationToDom: Blockly.ScratchBlocks.ProcedureUtils.definitionMutationToDom,
  domToMutation: Blockly.ScratchBlocks.ProcedureUtils.definitionDomToMutation,
  populateInput_: Blockly.ScratchBlocks.ProcedureUtils.populateInputCallerInternal_,
  addLabel_: Blockly.ScratchBlocks.ProcedureUtils.addLabelCaller_,

  // Only exists on the internal caller.
  attachArgumentReporter_: Blockly.ScratchBlocks.ProcedureUtils.attachArgumentReporter_
};

Blockly.Blocks['argument_reporter_boolean'] = {
  init: function() {
    this.jsonInit({ "message0": " %1",
      "args0": [
        {
          "type": "field_label_serializable",
          "name": "VALUE",
          "text": ""
        }
      ],
      "extensions": ["colours_more", "output_boolean"]
    });
  }
};

Blockly.Blocks['argument_reporter_string_number'] = {
  init: function() {
    this.jsonInit({ "message0": " %1",
      "args0": [
        {
          "type": "field_label_serializable",
          "name": "VALUE",
          "text": ""
        }
      ],
      "extensions": ["colours_more", "output_number", "output_string"]
    });
  }
};

Blockly.Blocks['boolean_textinput'] = {
  init: function() {
    this.jsonInit({ "message0": " %1",
      "args0": [
        {
          "type": "field_input",
          "name": "TEXT",
          "text": "foo"
        }
      ],
      "colour": Blockly.Colours.textField,
      "colourSecondary": Blockly.Colours.textField,
      "colourTertiary": Blockly.Colours.textField,
      "extensions": ["output_boolean"]
    });
  }
};

Blockly.Blocks['procedures_mutator_root'] = {
  /**
   * The root block in the procedure editing workspace.
   * @this Blockly.Block
   */
  init: function() {
    this.jsonInit({
      "extensions": ["colours_more", "shape_statement"]
    });
    /* Data known about the procedure. */
    this.procCode_ = '';
    this.displayNames_ = [];
    this.argumentDefaults_ = [];
    this.warp_ = false;

    /**
     * @type {!Object.<string, Blockly.Block>}
     * An object mapping parameter IDs to the blocks that are connected to those
     * IDs.
     */
    this.paramMap_ = null;
  },
  // Shared.
  getProcCode: Blockly.ScratchBlocks.ProcedureUtils.getProcCode,
  removeAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.removeAllInputs_,
  disconnectOldBlocks_: Blockly.ScratchBlocks.ProcedureUtils.disconnectOldBlocks_,
  deleteShadows_: Blockly.ScratchBlocks.ProcedureUtils.deleteShadows_,
  createAllInputs_: Blockly.ScratchBlocks.ProcedureUtils.createAllInputs_,
  updateDisplay_: Blockly.ScratchBlocks.ProcedureUtils.updateDisplay_,

  // Exist on all three blocks, but have different implementations.
  mutationToDom: Blockly.ScratchBlocks.ProcedureUtils.definitionMutationToDom,
  domToMutation: Blockly.ScratchBlocks.ProcedureUtils.definitionDomToMutation,
  populateInput_: Blockly.ScratchBlocks.ProcedureUtils.populateInputMutatorRoot_,
  addLabel_: Blockly.ScratchBlocks.ProcedureUtils.addLabelMutatorRoot_,

  // Shared with procedures_callnoreturn, but with a different implementation.
  attachShadow_: Blockly.ScratchBlocks.ProcedureUtils.attachShadowMutatorRoot_,

  // Only exist on the mutator root.
  addLabelExternal: Blockly.ScratchBlocks.ProcedureUtils.addLabelExternal,
  addBooleanExternal: Blockly.ScratchBlocks.ProcedureUtils.addBooleanExternal,
  addStringNumberExternal: Blockly.ScratchBlocks.ProcedureUtils.addStringNumberExternal,
  onChangeFn: Blockly.ScratchBlocks.ProcedureUtils.updateProcCodeMutatorRoot_
};
