// RUN! Before the Power runs out! - a game for LD39: Running out of Power
// (c) 2017 by Arthur Langereis — @zenmumbler

/// <reference path="../../stardazed/dist/stardazed.d.ts" />

import io = sd.io;
import asset = sd.asset;
import image = sd.image;
import math = sd.math;
import entity = sd.entity;
import render = sd.render;
import meshdata = sd.meshdata;
import dom = sd.dom;
import container = sd.container;
import audio = sd.audio;
import physics = sd.physics;
import system = sd.system;
import control = sd.control;

const { vec2, vec3, vec4, quat, mat3, mat4 } = veclib;

interface Element {
	mozRequestFullScreen(): void;
}

interface Document {
	mozFullScreenElement: HTMLElement;
}

